import attest from '@actions/attest'
import {bundleToJSON} from '@sigstore/bundle'
import {
  CIContextProvider,
  DSSEBundleBuilder,
  FulcioSigner,
  TSAWitness,
} from '@sigstore/sign'

const INTOTO_PAYLOAD_TYPE = 'application/vnd.in-toto+json'
const OIDC_AUDIENCE = 'sigstore'

const initBundleBuilder = () => {
  const identityProvider = new CIContextProvider(OIDC_AUDIENCE)
  const witnesses = []

  const signer = new FulcioSigner({
    identityProvider,
    fulcioBaseURL: 'https://fulcio.githubapp.com'
  })

  witnesses.push(
    new TSAWitness({ tsaBaseURL: 'https://timestamp.githubapp.com' })
  )

  // Build the bundle with the singleCertificate option which will
  // trigger the creation of v0.3 DSSE bundles
  return new DSSEBundleBuilder({signer, witnesses, singleCertificate: true})
}

const signPayload = async (payload) => {
  const artifact = {
    data: payload.body,
    type: payload.type
  }

  // Sign the artifact and build the bundle
  return initBundleBuilder().create(artifact)
}

const main = async () => {
  const predicate = await attest.buildSLSAProvenancePredicate();

  const sub1 = {
    uri: `pkg:github/bdehamer/attest-demo@${process.env.GITHUB_SHA}`,
    digest: { 'sha1': `${process.env.GITHUB_SHA}` }
  }

  const sub2 = {
    name: 'bin-linux.tgz',
    digest: { 'sha256': '40d117f04fa3970c2c852d2c6e0f5a9876fa8eb1c2e6ee6abe58bef58a7aa93a' }
  }

  const sub3 = {
    digest: { 'sha256': '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' }
  }


  const statement = {
    "_type": "https://in-toto.io/Statement/v1",
    subject: [ sub1, sub2, sub3 ],
    predicateType: "https://in-toto.io/attestation/release/v0.1",
    predicate: predicate
  }

  const bundle = await signPayload({
    body: Buffer.from(JSON.stringify(statement)),
    type: 'application/vnd.in-toto+json'
  });
  console.log(JSON.stringify(bundleToJSON(bundle)))
}

await main()
