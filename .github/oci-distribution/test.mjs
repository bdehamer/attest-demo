// Exercises the `oci-distribution` npm package end-to-end against a single OCI
// registry. It pushes a dummy image, attaches a related artifact to that image
// (the same shape as attaching an attestation to an image), then reads the
// artifact back by walking the image's referrers and pulling the artifact's
// content blob.
//
// Authentication is taken from the Docker config that the workflow's registry
// login step already populated (`~/.docker/config.json`), so this one script
// works unchanged across GHCR, Docker Hub, Azure ACR, AWS ECR, and Google
// Artifact Registry.
//
// Configuration (environment variables):
//   OCI_REGISTRY       required, e.g. "ghcr.io"
//   OCI_REPOSITORY     required, e.g. "bdehamer/attest-demo"
//   OCI_TAG            optional, tag for the dummy image (default "oci-dist")
//   OCI_ARTIFACT_TYPE  optional, artifactType of the attached artifact

import assert from 'node:assert/strict'
import {
  Registry,
  dockerConfigCredential,
  MEDIA_TYPE_OCI_IMAGE_MANIFEST,
  MEDIA_TYPE_OCI_IMAGE_CONFIG,
  MEDIA_TYPE_OCI_LAYER,
} from 'oci-distribution'

const REGISTRY = requireEnv('OCI_REGISTRY')
const REPOSITORY = requireEnv('OCI_REPOSITORY')
const TAG = process.env.OCI_TAG || 'oci-dist'
const ARTIFACT_TYPE =
  process.env.OCI_ARTIFACT_TYPE ||
  'application/vnd.oci-distribution.demo.artifact.v1+json'
const ARTIFACT_LAYER_MEDIA_TYPE =
  'application/vnd.oci-distribution.demo.content.v1+json'

const enc = (s) => new TextEncoder().encode(s)

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`)
  }
  return value
}

function short(descriptor) {
  return `${descriptor.digest} (${descriptor.size} bytes, ${descriptor.mediaType})`
}

// Build and push a minimal-but-valid OCI image (config + one layer) under TAG.
async function pushDummyImage(repo) {
  console.log(`\n▶ Pushing dummy image to ${REGISTRY}/${REPOSITORY}:${TAG}`)

  // 1. A single layer. Content is arbitrary; the registry does not inspect it.
  const layerBytes = enc(
    `oci-distribution demo layer @ ${new Date().toISOString()}\n`,
  )
  const layer = await repo.pushBlob({ mediaType: MEDIA_TYPE_OCI_LAYER }, layerBytes)
  console.log(`  • layer   ${short(layer)}`)

  // 2. A minimal OCI image config that references the layer as a diff id.
  const now = new Date().toISOString()
  const configBytes = enc(
    JSON.stringify({
      created: now,
      architecture: 'amd64',
      os: 'linux',
      config: {},
      rootfs: { type: 'layers', diff_ids: [layer.digest] },
      history: [{ created: now, created_by: 'oci-distribution demo' }],
    }),
  )
  const config = await repo.pushBlob(
    { mediaType: MEDIA_TYPE_OCI_IMAGE_CONFIG },
    configBytes,
  )
  console.log(`  • config  ${short(config)}`)

  // 3. The image manifest tying config + layer together, pushed under TAG.
  const manifestBytes = enc(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: MEDIA_TYPE_OCI_IMAGE_MANIFEST,
      config,
      layers: [layer],
    }),
  )
  const image = await repo.pushManifest(TAG, manifestBytes, {
    mediaType: MEDIA_TYPE_OCI_IMAGE_MANIFEST,
  })
  console.log(`  • image   ${short(image)}`)
  return image
}

// Attach an artifact manifest that references a content blob to `subject`.
async function attachArtifact(repo, subject) {
  console.log(`\n▶ Attaching ${ARTIFACT_TYPE} to the image`)

  const payload = enc(
    JSON.stringify({
      _type: 'https://oci-distribution.example/demo/v1',
      subject: { name: `${REGISTRY}/${REPOSITORY}`, digest: subject.digest },
      note: 'artifact attached via the oci-distribution client',
      timestamp: new Date().toISOString(),
    }),
  )
  const content = await repo.pushBlob(
    { mediaType: ARTIFACT_LAYER_MEDIA_TYPE },
    payload,
  )
  console.log(`  • content ${short(content)}`)

  const artifact = await repo.attachArtifact(subject, ARTIFACT_TYPE, [content], {
    annotations: {
      'org.opencontainers.image.created': new Date().toISOString(),
      'dev.oci-distribution.demo': 'true',
    },
  })
  console.log(`  • artifact ${short(artifact)}`)
  return { artifact, payload }
}

// Walk the image's referrers, fetch the artifact manifest, and pull its blob.
async function readBackArtifact(repo, subject, artifact, expectedPayload) {
  console.log('\n▶ Reading the artifact back via the referrers API')

  // 1. Discover referrers of the image, filtered to our artifact type.
  const index = await repo.referrers.list(subject.digest, {
    artifactType: ARTIFACT_TYPE,
  })
  console.log(`  • ${index.manifests.length} referrer(s) of type ${ARTIFACT_TYPE}`)
  const referrer = index.manifests.find((m) => m.digest === artifact.digest)
  assert.ok(referrer, 'attached artifact not found among the image referrers')
  assert.equal(referrer.artifactType, ARTIFACT_TYPE)

  // 2. Fetch the artifact manifest and confirm it points back at the image.
  const { manifest } = await repo.getManifest(artifact.digest)
  assert.equal(manifest.subject?.digest, subject.digest, 'artifact subject mismatch')
  assert.equal(manifest.artifactType, ARTIFACT_TYPE)
  const content = manifest.layers?.[0]
  assert.ok(content, 'artifact manifest has no layers')

  // 3. Pull the artifact's content blob (digest-verified by the client).
  const pulled = await repo.blobs.get(content.digest)
  assert.deepEqual(
    pulled,
    expectedPayload,
    'pulled artifact content does not match what was pushed',
  )
  console.log(`  • pulled ${pulled.byteLength} bytes and verified content matches`)
}

async function main() {
  console.log(
    `oci-distribution demo → registry=${REGISTRY} repository=${REPOSITORY} tag=${TAG}`,
  )

  const registry = new Registry(REGISTRY, {
    credentials: dockerConfigCredential(),
  })
  const repo = registry.repository(REPOSITORY)

  const image = await pushDummyImage(repo)

  // Confirm the image is retrievable by tag (read path for the image itself).
  const resolved = await repo.resolve(TAG)
  assert.equal(resolved.digest, image.digest, 'tag did not resolve to the pushed image')
  console.log(`\n▶ Tag ${TAG} resolves to ${resolved.digest}`)

  const { artifact, payload } = await attachArtifact(repo, image)
  await readBackArtifact(repo, image, artifact, payload)

  console.log('\n✅ Success: pushed an image, attached an artifact, and pulled it back.')
}

main().catch((err) => {
  console.error(`\n❌ Failed: ${err?.stack || err}`)
  process.exit(1)
})
