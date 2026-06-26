"""
Generates icon16.png, icon48.png, icon128.png for the extension.
Style: deep navy rounded-square background + a teal padlock glyph,
matching the popup's color tokens (#0a1628 background, #2dd4bf teal).
"""
from PIL import Image, ImageDraw

NAVY = (10, 22, 40, 255)       # #0a1628
TEAL = (45, 212, 191, 255)     # #2dd4bf
NAVY_BORDER = (30, 58, 82, 255)  # #1e3a52


def rounded_square(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=NAVY)
    draw.rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, outline=NAVY_BORDER, width=max(1, size // 32)
    )
    return img, draw


def draw_padlock(draw, size):
    # All measurements are proportional to `size` so this scales cleanly
    # across 16 / 48 / 128 px.
    cx = size / 2
    body_w = size * 0.46
    body_h = size * 0.36
    body_top = size * 0.50
    body_left = cx - body_w / 2
    body_right = cx + body_w / 2
    body_bottom = body_top + body_h
    body_radius = size * 0.07

    # Shackle (the curved part on top of the lock)
    shackle_w = size * 0.30
    shackle_top = size * 0.20
    shackle_bottom = body_top + size * 0.04
    line_width = max(1, round(size * 0.07))

    draw.arc(
        [cx - shackle_w / 2, shackle_top, cx + shackle_w / 2, body_top + size * 0.16],
        start=180,
        end=360,
        fill=TEAL,
        width=line_width,
    )
    # Two short vertical strokes connecting the arc down to the lock body
    draw.line(
        [(cx - shackle_w / 2, shackle_top + (body_top + size * 0.16 - shackle_top) / 2),
         (cx - shackle_w / 2, shackle_bottom)],
        fill=TEAL, width=line_width,
    )
    draw.line(
        [(cx + shackle_w / 2, shackle_top + (body_top + size * 0.16 - shackle_top) / 2),
         (cx + shackle_w / 2, shackle_bottom)],
        fill=TEAL, width=line_width,
    )

    # Lock body
    draw.rounded_rectangle(
        [body_left, body_top, body_right, body_bottom],
        radius=body_radius,
        fill=TEAL,
    )

    # Keyhole (a small navy circle + slit cut out of the teal body)
    hole_r = size * 0.035
    hole_cx, hole_cy = cx, body_top + body_h * 0.42
    draw.ellipse(
        [hole_cx - hole_r, hole_cy - hole_r, hole_cx + hole_r, hole_cy + hole_r],
        fill=NAVY,
    )
    draw.rectangle(
        [hole_cx - hole_r * 0.6, hole_cy, hole_cx + hole_r * 0.6, body_bottom - size * 0.05],
        fill=NAVY,
    )


def make_icon(size):
    img, draw = rounded_square(size)
    draw_padlock(draw, size)
    return img


for s in (16, 48, 128):
    icon = make_icon(s)
    icon.save(f"/home/claude/leetcode-discipline-extension/icons/icon{s}.png")

print("Icons generated.")
