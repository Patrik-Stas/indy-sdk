ARG BASE_IMAGE_LIBINDY
FROM ${BASE_IMAGE_LIBINDY}

USER indy
RUN cargo build --manifest-path=/home/indy/indy-sdk/vcx/dummy-cloud-agent/Cargo.toml



