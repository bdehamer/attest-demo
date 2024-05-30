FROM docker.io/library/ubuntu:24.04@sha256:3f85b7caad41a95462cf5b787d8a04604c8262cdcdf9a472b8c52ef83375fe15

# Versions of core components.
ARG QBITTORRENT_VERSION

WORKDIR /tmp

# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/ca-certificates versioning=deb
ENV CA_CERTIFICATES_VERSION="20240203"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/cmake versioning=deb
ENV CMAKE_VERSION="3.28.3-1build7"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/curl versioning=deb
ENV CURL_VERSION="8.5.0-2ubuntu10.1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/g++ versioning=deb
ENV GPP_VERSION="4:13.2.0-7ubuntu1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/gcc versioning=deb
ENV GCC_VERSION="4:13.2.0-7ubuntu1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/libboost-dev versioning=deb
ENV LIBBOOST_VERSION="1.83.0.1ubuntu2"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/universe/libtorrent-rasterbar-dev versioning=deb
ENV LIBTORRENT_RASTERBAR_VERSION="2.0.10-1.1build2"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/make versioning=deb
ENV MAKE_VERSION="4.3-4.1build2"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/openssl versioning=deb
ENV OPENSSL_VERSION="3.0.13-0ubuntu3.1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/python3 versioning=deb
ENV PYTHON3_VERSION="3.12.3-0ubuntu1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/universe/qtbase5-dev versioning=deb
ENV QTBASE_VERSION="5.15.13+dfsg-1ubuntu1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/universe/qttools5-dev versioning=deb
ENV QTTOOLS_VERSION="5.15.13-1"
# renovate: datasource=custom.apt.ubuntu depName=ubuntu-observable/noble/main/zlib1g-dev versioning=deb
ENV ZLIB_VERSION="1:1.3.dfsg-3.1ubuntu2"

# Install dependencies
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install --no-install-recommends --yes \
  ca-certificates=${CA_CERTIFICATES_VERSION} \
  cmake=${CMAKE_VERSION} \
  curl=${CURL_VERSION} \
  g++=${GPP_VERSION} \
  gcc=${GCC_VERSION} \
  libboost-dev=${LIBBOOST_VERSION} \
  libssl3=${OPENSSL_VERSION} \
  libssl-dev=${OPENSSL_VERSION} \
  libtorrent-rasterbar-dev=${LIBTORRENT_RASTERBAR_VERSION} \
  make=${MAKE_VERSION} \
  openssl=${OPENSSL_VERSION} \
  python3=${PYTHON3_VERSION} \
  qtbase5-dev=${QTBASE_VERSION} \
  qtbase5-private-dev=${QTBASE_VERSION} \
  qttools5-dev=${QTTOOLS_VERSION} \
  zlib1g-dev=${ZLIB_VERSION} \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# qBittorrent
RUN curl --location --silent "https://github.com/qbittorrent/qBittorrent/archive/refs/tags/release-${QBITTORRENT_VERSION}.tar.gz" --output "qbittorrent.tar.gz" \
  # Quietly unpack
  && tar xzf qbittorrent.tar.gz \
  && rm qbittorrent.tar.gz \
  # Build qBittorrent
  && cd "qBittorrent-release-${QBITTORRENT_VERSION}" \
  && ./configure --disable-gui \
  && make --jobs $(nproc --all) \
  && make install \
  && rm -rf /tmp/*

WORKDIR /config

ENTRYPOINT [ "/usr/local/bin/qbittorrent-nox", "--profile=/config", "--relative-fastresume" ]
