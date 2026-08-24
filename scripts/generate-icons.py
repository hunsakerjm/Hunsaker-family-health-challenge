#!/usr/bin/env python3
"""
Generate PWA icons: app mark with rounded-square background and checkmark glyph.
Outputs: icon-192.png, icon-512.png, icon-192-maskable.png, icon-512-maskable.png,
apple-touch-icon-180.png to public/icons/.

Uses raw PNG binary format to avoid PIL dependency issues.
"""

import zlib
import struct
import os
import math

# Colors from src/theme.ts
INK_RGB = (0x16, 0x19, 0x1C)  # app dark ink #16191C
GLYPH_RGB = (0x46, 0xA7, 0x58)  # grass green #46A758
WHITE_RGB = (0xFF, 0xFF, 0xFF)

# Icon sizes
ICON_192 = 192
ICON_512 = 512
APPLE_ICON_SIZE = 180


def draw_circle(pixels: bytearray, size: int, cx: int, cy: int, r: int, color: tuple[int, int, int]):
    """Draw a filled circle on pixel data (RGBA format)."""
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            if dx * dx + dy * dy <= r * r:
                idx = (y * size + x) * 4
                pixels[idx:idx+4] = bytes([color[0], color[1], color[2], 0xFF])


def draw_line(pixels: bytearray, size: int, x1: int, y1: int, x2: int, y2: int,
              width: int, color: tuple[int, int, int]):
    """Draw a thick line using Bresenham's algorithm."""
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy

    x, y = x1, y1
    while True:
        # Plot thick pixel
        for wy in range(-width//2, width//2 + 1):
            for wx in range(-width//2, width//2 + 1):
                px, py = x + wx, y + wy
                if 0 <= px < size and 0 <= py < size:
                    idx = (py * size + px) * 4
                    pixels[idx:idx+4] = bytes([color[0], color[1], color[2], 0xFF])

        if x == x2 and y == y2:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x += sx
        if e2 < dx:
            err += dx
            y += sy


def draw_filled_rounded_rect(pixels: bytearray, size: int, x1: int, y1: int, x2: int, y2: int,
                             radius: int, color: tuple[int, int, int]):
    """Draw a filled rounded rectangle."""
    for y in range(size):
        for x in range(size):
            # Determine if point is inside rounded rect
            in_rect = (x1 <= x <= x2 and y1 <= y <= y2)
            if in_rect:
                # Check corners
                if x < x1 + radius and y < y1 + radius:
                    # Top-left corner
                    dx = x - (x1 + radius)
                    dy = y - (y1 + radius)
                    if dx * dx + dy * dy > radius * radius:
                        in_rect = False
                elif x > x2 - radius and y < y1 + radius:
                    # Top-right corner
                    dx = x - (x2 - radius)
                    dy = y - (y1 + radius)
                    if dx * dx + dy * dy > radius * radius:
                        in_rect = False
                elif x < x1 + radius and y > y2 - radius:
                    # Bottom-left corner
                    dx = x - (x1 + radius)
                    dy = y - (y2 - radius)
                    if dx * dx + dy * dy > radius * radius:
                        in_rect = False
                elif x > x2 - radius and y > y2 - radius:
                    # Bottom-right corner
                    dx = x - (x2 - radius)
                    dy = y - (y2 - radius)
                    if dx * dx + dy * dy > radius * radius:
                        in_rect = False

            if in_rect:
                idx = (y * size + x) * 4
                pixels[idx:idx+4] = bytes([color[0], color[1], color[2], 0xFF])


def create_png_bytes(size: int, maskable: bool = False) -> bytes:
    """Create a PNG file with icon design."""
    # Create RGBA image buffer (4 bytes per pixel)
    pixels = bytearray(size * size * 4)

    # Initialize with transparent pixels
    for i in range(0, len(pixels), 4):
        pixels[i:i+4] = bytes([0, 0, 0, 0])

    # Background: rounded square
    bg_radius = max(1, int(size * 0.18))
    bg_margin = int(size * 0.08)
    draw_filled_rounded_rect(pixels, size, bg_margin, bg_margin,
                            size - bg_margin - 1, size - bg_margin - 1,
                            bg_radius, INK_RGB)

    # Glyph: checkmark
    if maskable:
        safe_size = int(size * 0.8)
        glyph_margin = (size - safe_size) // 2
    else:
        glyph_margin = int(size * 0.15)

    glyph_size = size - (2 * glyph_margin)
    line_width = max(2, int(size * 0.08))

    # Checkmark coords
    left_x = glyph_margin + int(glyph_size * 0.25)
    left_y = glyph_margin + int(glyph_size * 0.55)
    mid_x = glyph_margin + int(glyph_size * 0.42)
    mid_y = glyph_margin + int(glyph_size * 0.72)
    right_x = glyph_margin + int(glyph_size * 0.75)
    right_y = glyph_margin + int(glyph_size * 0.28)

    # Draw checkmark
    draw_line(pixels, size, left_x, left_y, mid_x, mid_y, line_width, GLYPH_RGB)
    draw_line(pixels, size, mid_x, mid_y, right_x, right_y, line_width, GLYPH_RGB)

    # Convert RGBA to PNG format
    png_data = bytearray()

    # PNG signature
    png_data.extend(b'\x89PNG\r\n\x1a\n')

    # IHDR chunk (image header)
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png_data.extend(_create_chunk(b'IHDR', ihdr_data))

    # IDAT chunk (image data)
    raw_data = bytearray()
    for y in range(size):
        raw_data.append(0)  # Filter type (none)
        for x in range(size):
            idx = (y * size + x) * 4
            raw_data.extend(pixels[idx:idx+4])

    compressed = zlib.compress(bytes(raw_data), 9)
    png_data.extend(_create_chunk(b'IDAT', compressed))

    # IEND chunk
    png_data.extend(_create_chunk(b'IEND', b''))

    return bytes(png_data)


def _create_chunk(chunk_type: bytes, data: bytes) -> bytes:
    """Create a PNG chunk with CRC."""
    chunk_data = chunk_type + data
    crc = zlib.crc32(chunk_data) & 0xffffffff
    return struct.pack('>I', len(data)) + chunk_data + struct.pack('>I', crc)


def main():
    out_dir = 'public/icons'
    os.makedirs(out_dir, exist_ok=True)

    print('Generating icons...')

    # Standard icons
    for size, name in [(ICON_192, 'icon-192'), (ICON_512, 'icon-512')]:
        png_data = create_png_bytes(size)
        path = f'{out_dir}/{name}.png'
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'  {name}.png ({size}x{size})')

    # Maskable icons
    for size, name in [(ICON_192, 'icon-192-maskable'), (ICON_512, 'icon-512-maskable')]:
        png_data = create_png_bytes(size, maskable=True)
        path = f'{out_dir}/{name}.png'
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'  {name}.png ({size}x{size})')

    # Apple touch icon
    png_data = create_png_bytes(APPLE_ICON_SIZE)
    with open(f'{out_dir}/apple-touch-icon-180.png', 'wb') as f:
        f.write(png_data)
    print(f'  apple-touch-icon-180.png ({APPLE_ICON_SIZE}x{APPLE_ICON_SIZE})')

    print(f'\nAll icons generated in {out_dir}/')


if __name__ == '__main__':
    main()
