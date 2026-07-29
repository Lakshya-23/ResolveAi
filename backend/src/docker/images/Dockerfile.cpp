FROM gcc:13-bookworm

# Install system tools + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ripgrep \
    fd-find \
    jq \
    cmake \
    make \
    gdb \
    valgrind \
    clang-format \
    clang-tidy \
    && rm -rf /var/lib/apt/lists/*

# fd symlink
RUN ln -sf /usr/bin/fdfind /usr/bin/fd

WORKDIR /workspace

CMD ["tail", "-f", "/dev/null"]
