FROM ubuntu:16.04 as BASE

ARG uid=1000

RUN apt-get update && \
    apt-get install -y \
      pkg-config \
      libssl-dev \
      libgmp3-dev \
      curl \
      build-essential \
      libsqlite3-dev \
      cmake \
      git \
      python3.5 \
      python3-pip \
      python-setuptools \
      apt-transport-https \
      ca-certificates \
      debhelper \
      wget \
      devscripts \
      libncursesw5-dev \
      libzmq3-dev \
      zip \
      unzip \
      jq


RUN pip3 install -U \
	pip \
	setuptools \
	virtualenv \
	twine \
	plumbum \
	deb-pkg-tools

RUN cd /tmp && \
   curl https://download.libsodium.org/libsodium/releases/old/libsodium-1.0.14.tar.gz | tar -xz && \
    cd /tmp/libsodium-1.0.14 && \
    ./configure --disable-shared && \
    make && \
    make install && \
    rm -rf /tmp/libsodium-1.0.14

RUN useradd -ms /bin/bash -u $uid indy
USER indy

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain 1.36.0
ENV PATH /home/indy/.cargo/bin:$PATH

# build libindy
WORKDIR /home/indy
COPY --chown=indy:indy tmpdocker /home/indy/indy-sdk

RUN cargo build --release --manifest-path=/home/indy/indy-sdk/libindy/Cargo.toml
USER root
RUN mv /home/indy/indy-sdk/libindy/target/release/*.so /usr/lib
USER indy

# build agency dependencies
# missing feature: cargo build --only-dependencies; Using workaround: https://github.com/rust-lang/cargo/issues/2644#issuecomment-526931209
# if we dont' do this, we will have to download and build all dependencies everytime we make a modification in agency code
RUN mkdir -p /home/indy/indy-sdk/vcx/dummy-cloud-agent
WORKDIR /home/indy/indy-sdk/vcx/dummy-cloud-agent
COPY --chown=indy:indy Cargo* ./
RUN mkdir src
RUN echo "fn main() { }" > ./src/main.rs
RUN cargo build --release
RUN rm ./target/release/deps/indy_dummy_agent*
RUN rm ./src/main.rs

# build the agency
WORKDIR /home/indy/indy-sdk/vcx/dummy-cloud-agent
COPY --chown=indy:indy src     src/
COPY --chown=indy:indy build.rs build.rs
RUN cargo build --release

## the only thing we really need is libindy and agency executable for linux architecture, we have that already!
FROM ubuntu:16.04
RUN apt-get update && \
    apt-get install -y \
      libssl-dev \
      libgmp3-dev \
      libsqlite3-dev \
      apt-transport-https \
      ca-certificates

RUN useradd -ms /bin/bash -u 1000 indy

COPY --from=BASE /var/lib/dpkg/info /var/lib/dpkg/info
COPY --from=BASE /usr/lib/x86_64-linux-gnu /usr/lib/x86_64-linux-gnu
## could be probably optimized. I am not sure which particular libs are enough to cherry pick
COPY --from=BASE /usr/local /usr/local
COPY --from=BASE /usr/lib/libindy.so /usr/lib/libindy.so
COPY --from=BASE /home/indy/indy-sdk/vcx/dummy-cloud-agent/target/release/indy-dummy-agent /home/indy/indy-dummy-agent

USER indy
WORKDIR /home/indy
COPY --chown=indy:indy config config
RUN mkdir -p /home/indy/.indy_client/wallet

ENV RUST_BACKTRACE=1
ENV RUST_LOG='actix_web=info,indy=error,indy_dummy_agent=debug'
ENTRYPOINT ["/home/indy/indy-dummy-agent"]
CMD ["/home/indy/config/docker.json"]