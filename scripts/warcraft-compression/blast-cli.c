/* Author: MiYu. Bounded binary stdin/stdout adapter for zlib's PKWARE decoder. */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <io.h>
#include <fcntl.h>
#include "blast.h"

struct stream { unsigned char buffer[4096]; size_t written; size_t limit; };
static unsigned input(void *opaque, unsigned char **buffer) {
    struct stream *stream = opaque;
    *buffer = stream->buffer;
    return (unsigned)fread(stream->buffer, 1, sizeof(stream->buffer), stdin);
}
static int output(void *opaque, unsigned char *buffer, unsigned length) {
    struct stream *stream = opaque;
    if (length > stream->limit - stream->written || fwrite(buffer, 1, length, stdout) != length) return 1;
    stream->written += length;
    return 0;
}
int main(int argc, char **argv) {
    char *end;
    unsigned long requested;
    struct stream stream = { {0}, 0, 0 };
    int result;
    if (argc != 2) return 2;
    errno = 0;
    requested = strtoul(argv[1], &end, 10);
    if (errno || *end || !requested || requested > 268435456UL) return 2;
    stream.limit = requested;
    if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1) return 2;
    result = blast(input, &stream, output, &stream, NULL, NULL);
    if (result || ferror(stdin) || ferror(stdout) || stream.written != stream.limit) {
        fprintf(stderr, "PKWARE decode failed: %d; output %zu, expected %zu\n", result, stream.written, stream.limit);
        return 1;
    }
    return fflush(stdout) ? 1 : 0;
}
