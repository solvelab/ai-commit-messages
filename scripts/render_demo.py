"""
Draws the animation for the README.

The window is an illustration — there is no display server on this machine to capture. What is *not*
invented is the text: the commit message is the literal output of the extension's pipeline against a
real Ollama running qwen2.5-coder:7b, temperature 0, first attempt, no retry.

Palette from the product: the logo's periwinkle and salmon over the editor's dark surfaces.
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 880, 300
SCALE = 2  # drawn at 2x and downsampled, so text gets real antialiasing

BG = (30, 30, 30)
PANEL = (37, 37, 38)
BORDER = (62, 62, 62)
INPUT_BG = (60, 60, 60)
TEXT = (204, 204, 204)
DIM = (140, 140, 140)
FAINT = (110, 110, 110)
BLUE = (0, 122, 204)
ACCENT = (246, 133, 98)       # #F68562 — the sparkle in the logo
PERIWINKLE = (140, 155, 249)  # #8C9BF9 — the bot
GREEN = (106, 176, 106)
RED = (196, 96, 96)
WHITE = (255, 255, 255)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size * SCALE)


F_UI = font(DEJAVU, 12)
F_UI_B = font(DEJAVU_B, 12)
F_TITLE = font(DEJAVU_B, 10)
F_SMALL = font(DEJAVU, 10)
F_MSG = font(MONO, 11)
F_DIFF = font(MONO, 10)
F_EMOJI = font(DEJAVU, 11)


def s(v: float) -> int:
    return int(v * SCALE)


def box(draw, rect, radius=3, fill=None, outline=None, width=1):
    draw.rounded_rectangle([s(rect[0]), s(rect[1]), s(rect[2]), s(rect[3])],
                           radius=s(radius), fill=fill, outline=outline, width=s(width))


def write(draw, xy, value, fnt, fill):
    draw.text((s(xy[0]), s(xy[1])), value, font=fnt, fill=fill)


def width_of(draw, value, fnt) -> float:
    return draw.textlength(value, font=fnt) / SCALE


def sparkle(draw, cx, cy, size, colour):
    """The four-pointed star, drawn rather than typed: no font here carries U+2728."""
    x, y, r = s(cx), s(cy), s(size)
    inner = max(1, int(r * 0.30))  # a waist this thin is what makes it read as a star, not a plus
    draw.polygon([(x, y - r), (x + inner, y - inner), (x + r, y), (x + inner, y + inner),
                  (x, y + r), (x - inner, y + inner), (x - r, y), (x - inner, y - inner)],
                 fill=colour)


def bot_icon(draw, x, y, colour, accent):
    """The extension's icon at toolbar size: head, antenna, eyes, and the sparkle beside it."""
    box(draw, (x, y + 3, x + 13, y + 13), radius=3, outline=colour, width=1)
    draw.line([s(x + 6.5), s(y), s(x + 6.5), s(y + 3)], fill=colour, width=s(1))
    draw.ellipse([s(x + 4.5), s(y - 2.5), s(x + 8.5), s(y + 1.5)], outline=colour, width=s(1))
    draw.ellipse([s(x + 3.5), s(y + 6), s(x + 5.5), s(y + 8)], fill=colour)
    draw.ellipse([s(x + 8), s(y + 6), s(x + 10), s(y + 8)], fill=colour)
    sparkle(draw, x + 18, y + 2, 4, accent)


def spinner(draw, cx, cy, radius, angle, colour):
    draw.arc([s(cx - radius), s(cy - radius), s(cx + radius), s(cy + radius)],
             start=angle, end=angle + 250, fill=colour, width=s(2))


def frame(*, spin_angle=None, typed="", caret=False, busy=False, hover=False) -> Image.Image:
    image = Image.new("RGB", (W * SCALE, H * SCALE), BG)
    draw = ImageDraw.Draw(image)

    # ---- source control header + toolbar -----------------------------------------
    write(draw, (16, 14), "SOURCE CONTROL", F_TITLE, DIM)

    if busy:
        spinner(draw, 300, 20, 7, spin_angle or 0, ACCENT)
    else:
        if hover:
            box(draw, (291, 11, 313, 29), radius=3, fill=(58, 58, 58))
        bot_icon(draw, 294, 13, PERIWINKLE, ACCENT)

    for cx in (334, 356, 378):  # the editor's own buttons, sketched
        draw.line([s(cx - 5), s(20), s(cx + 5), s(20)], fill=FAINT, width=s(1))

    # ---- commit message box -------------------------------------------------------
    active = bool(typed) or busy
    box(draw, (16, 36, 392, 136), radius=3, fill=INPUT_BG,
        outline=BLUE if active else BORDER, width=1)

    if typed:
        y = 44
        for index, line in enumerate(typed.split("\n")):
            if index == 0:
                if line:
                    emoji, _, rest = line.partition(" ")
                    write(draw, (24, y - 1), emoji, F_EMOJI, ACCENT)
                    write(draw, (24 + 16, y), rest, F_MSG, TEXT)
            else:
                write(draw, (24, y), line, F_MSG, TEXT if line else DIM)
            y += 16
        if caret:
            lines = typed.split("\n")
            last = lines[-1]
            x = 24 + (16 + width_of(draw, last.partition(" ")[2], F_MSG)
                      if len(lines) == 1 else width_of(draw, last, F_MSG))
            draw.line([s(x + 2), s(y - 15), s(x + 2), s(y - 3)], fill=TEXT, width=s(1))
    else:
        write(draw, (24, 44), "Message (press Ctrl+Enter to commit)", F_UI, FAINT)

    # ---- commit button ------------------------------------------------------------
    box(draw, (16, 144, 392, 170), radius=3, fill=BLUE)
    label = "✓ Commit"
    write(draw, (16 + (376 - width_of(draw, label, F_UI_B)) / 2, 149), label, F_UI_B, WHITE)

    # ---- staged changes -----------------------------------------------------------
    write(draw, (16, 186), "Staged Changes", F_TITLE, DIM)
    box(draw, (358, 184, 376, 197), radius=6, fill=(78, 78, 78))
    write(draw, (364, 185), "1", F_SMALL, TEXT)

    box(draw, (16, 204, 392, 224), radius=3, fill=(45, 45, 45))
    write(draw, (24, 208), "TS", F_SMALL, PERIWINKLE)
    write(draw, (44, 207), "store.ts", F_UI, TEXT)
    write(draw, (100, 208), "src/cache", F_SMALL, FAINT)
    write(draw, (378, 208), "M", F_SMALL, GREEN)

    # ---- the staged diff, on the right --------------------------------------------
    box(draw, (410, 36, 864, 224), radius=4, fill=PANEL, outline=BORDER, width=1)
    write(draw, (424, 44), "src/cache/store.ts", F_SMALL, DIM)
    diff = [
        ("   get(key: string): Entry | undefined {", FAINT),
        ("-    return this.entries.get(key)", RED),
        ("+    const entry = this.entries.get(key)", GREEN),
        ("+    if (entry && entry.expiresAt < Date.now()) {", GREEN),
        ("+      this.entries.delete(key)", GREEN),
        ("+      return undefined", GREEN),
        ("+    }", GREEN),
        ("+    return entry", GREEN),
        ("   }", FAINT),
    ]
    y = 64
    for line, colour in diff:
        write(draw, (424, y), line, F_DIFF, colour)
        y += 16

    # ---- status bar ----------------------------------------------------------------
    box(draw, (0, H - 24, W, H), radius=0, fill=BLUE)
    if busy:
        spinner(draw, 24, H - 12, 6, spin_angle or 0, WHITE)
        write(draw, (38, H - 18), "Generating with qwen2.5-coder:7b…", F_SMALL, WHITE)
    else:
        sparkle(draw, 22, H - 12, 5, WHITE)
        write(draw, (34, H - 18), "qwen2.5-coder:7b @ localhost:11434", F_SMALL, WHITE)

    return image.resize((W, H), Image.LANCZOS)
