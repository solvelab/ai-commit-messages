"""
Draws `docs/media/how-it-works.png`.

The same diagram exists as SVG, which is sharper and smaller — but the Marketplace refuses SVG in a
README (`vsce` fails the package), so the README needs a raster copy. The SVG stays for the GitHub
docs, and this keeps the two in step.

    python3 scripts/render_diagram.py
"""

from PIL import Image, ImageDraw, ImageFont

W, H, SCALE = 880, 300, 2

BG = (30, 30, 30)
CARD = (37, 37, 38)
BORDER = (62, 62, 62)
STEP = (228, 228, 228)
NOTE = (155, 155, 155)
ACCENT = (246, 133, 98)
PERIWINKLE = (140, 155, 249)
EDGE = (74, 74, 106)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def font(path, size):
    return ImageFont.truetype(path, size * SCALE)


F_STEP = font(DEJAVU_B, 13)
F_NOTE = font(DEJAVU, 10)
F_LEAD = font(DEJAVU_B, 10)
F_MONO = font(MONO, 11)


def s(v):
    return int(v * SCALE)


def card(draw, x, y, w, h, outline=BORDER):
    draw.rounded_rectangle([s(x), s(y), s(x + w), s(y + h)], radius=s(5), fill=CARD,
                           outline=outline, width=s(1))


def write(draw, x, y, value, fnt, fill):
    draw.text((s(x), s(y)), value, font=fnt, fill=fill)


def arrow(draw, x1, y1, x2, y2):
    draw.line([s(x1), s(y1), s(x2), s(y2)], fill=EDGE, width=s(1.5))
    draw.polygon([(s(x2), s(y2)), (s(x2 - 5), s(y2 - 3)), (s(x2 - 5), s(y2 + 3))], fill=EDGE)


def render() -> Image.Image:
    image = Image.new("RGB", (W * SCALE, H * SCALE), BG)
    draw = ImageDraw.Draw(image)

    write(draw, 32, 26, "FROM THE STAGED DIFF TO THE COMMIT MESSAGE", F_LEAD, ACCENT)
    write(draw, 32, 48, "Every arrow crosses a boundary that costs something: tokens, privacy, or trust in the output.",
          F_NOTE, NOTE)

    steps = [
        (32, 150, "Staged diff", ["read per file, with", "untracked included"], BORDER),
        (206, 150, "Budget", ["lockfiles out, fitted", "to the real window"], BORDER),
        (380, 150, "Redact", ["keys, tokens, JWTs", "masked before it goes"], BORDER),
        (554, 150, "Your model", ["the endpoint you set", "and nowhere else"], ACCENT),
        (728, 120, "Validate", ["shape checked,", "one retry"], BORDER),
    ]
    for x, width, title, notes, outline in steps:
        card(draw, x, 88, width, 76, outline)
        write(draw, x + 14, 100, title, F_STEP, STEP)
        for index, note in enumerate(notes):
            write(draw, x + 14, 124 + index * 16, note, F_NOTE, NOTE)

    for x1, x2 in ((182, 206), (356, 380), (530, 554), (704, 728)):
        arrow(draw, x1, 126, x2, 126)

    # the model answers structure; the extension renders the text
    draw.line([s(788), s(164), s(788), s(196)], fill=EDGE, width=s(1.5))
    draw.line([s(788), s(196), s(120), s(196)], fill=EDGE, width=s(1.5))
    arrow(draw, 120, 200, 120, 216)
    write(draw, 320, 186, "the model answers JSON — the extension renders the message", F_NOTE, NOTE)

    card(draw, 32, 220, 816, 52)
    write(draw, 46, 232, "♻️ refactor: update cache store to expire entries", F_MONO, PERIWINKLE)
    write(draw, 46, 252,
          "emoji from code · blank line from code · one imperative action per line, within the word budget",
          F_NOTE, NOTE)

    return image.resize((W, H), Image.LANCZOS)


if __name__ == "__main__":
    render().save("docs/media/how-it-works.png")
    print("docs/media/how-it-works.png")
