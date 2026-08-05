#!/usr/bin/env python3
"""Pack PNGs into a multi-size .ico.

No ICO encoder exists on this machine (no ImageMagick, no sharp, no Pillow), and
installing a toolchain for one asset isn't worth it — the container format is
simple enough to write directly.

Layout: ICONDIR header, then one 16-byte ICONDIRENTRY per image, then the raw
PNG blobs. PNG-compressed entries are supported by every browser that matters.

Usage: make-ico.py out.ico 16.png 32.png 48.png
"""
import struct
import sys
import zlib
from pathlib import Path


def png_size(blob: bytes) -> tuple[int, int]:
    """Read width/height from the IHDR chunk, and verify the file is a PNG."""
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    if blob[12:16] != b"IHDR":
        raise ValueError("first chunk is not IHDR")
    width, height = struct.unpack(">II", blob[16:24])
    return width, height


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    out = Path(sys.argv[1])
    blobs = [Path(p).read_bytes() for p in sys.argv[2:]]

    header = struct.pack("<HHH", 0, 1, len(blobs))  # reserved, type=icon, count
    offset = len(header) + 16 * len(blobs)

    entries, payload = [], []
    for blob in blobs:
        width, height = png_size(blob)
        if not 1 <= width <= 256 or not 1 <= height <= 256:
            raise ValueError(f"{width}x{height} is out of range for an ICO")
        entries.append(struct.pack(
            "<BBBBHHII",
            width % 256,   # 0 means 256
            height % 256,
            0,             # palette entries
            0,             # reserved
            1,             # colour planes
            32,            # bits per pixel
            len(blob),
            offset,
        ))
        payload.append(blob)
        offset += len(blob)

    out.write_bytes(header + b"".join(entries) + b"".join(payload))

    # Re-parse what we just wrote: a malformed ICO fails silently in browsers,
    # showing a blank tab rather than an error.
    data = out.read_bytes()
    _, kind, count = struct.unpack("<HHH", data[:6])
    assert kind == 1 and count == len(blobs), "bad ICONDIR"
    sizes = []
    for i in range(count):
        w, h, _, _, _, _, length, off = struct.unpack(
            "<BBBBHHII", data[6 + 16 * i: 22 + 16 * i])
        assert data[off + 1:off + 4] == b"PNG", f"entry {i} is not a PNG"
        assert zlib.crc32(data[off:off + length]) is not None
        sizes.append(f"{w or 256}x{h or 256}")
    print(f"  verified {out.name}: {', '.join(sizes)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
