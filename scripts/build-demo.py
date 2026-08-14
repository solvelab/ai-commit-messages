"""
Builds the README animation: frames drawn with PIL, encoded to GIF by ffmpeg.

    python3 scripts/build-demo.py && mv demo.gif docs/media/

The window is drawn, not captured — there is no display server in the environment this was made in.
The commit message is not drawn from imagination: it is the literal output of the pipeline against a
real Ollama, and regenerating it is a matter of running the pipeline again.
"""
import pathlib, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from render_demo import frame

MESSAGE = ("♻️ refactor: update cache store to expire entries\n"
           "\n"
           "check if entry has expired\n"
           "delete expired entry from cache\n"
           "return undefined for expired entries")

FPS = 15
out = pathlib.Path("frames")
out.mkdir(exist_ok=True)
for old in out.glob("*.png"):
    old.unlink()

frames = []
def hold(image, seconds):
    frames.extend([image] * max(1, round(seconds * FPS)))

# 1. the box is empty and the pointer arrives at the button
hold(frame(), 0.9)
hold(frame(hover=True), 0.7)

# 2. the click: the button flashes, then the spinner takes its place
hold(frame(busy=True, spin_angle=0), 0.1)

# 3. working — the spinner turns and the status bar says with which model
for i in range(round(2.2 * FPS)):
    frames.append(frame(busy=True, spin_angle=(i * 28) % 360))

# 4. the message lands, line by line, with a caret
lines = MESSAGE.split("\n")
partial = ""
for index, line in enumerate(lines):
    step = max(1, len(line) // 8) if line else 1
    for cut in range(0, len(line) + 1, step):
        partial_now = "\n".join(lines[:index] + [line[:cut]])
        frames.extend([frame(typed=partial_now, caret=True)] * 1)
    partial = "\n".join(lines[:index + 1])
    frames.extend([frame(typed=partial, caret=True)] * 2)

# 5. done: caret off, and a pause long enough to read it
hold(frame(typed=MESSAGE), 2.4)

for number, image in enumerate(frames):
    image.save(out / f"{number:04d}.png")
print(f"{len(frames)} frames, {len(frames)/FPS:.1f}s")

subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS),
                "-i", "frames/%04d.png", "-vf", "palettegen=max_colors=128:stats_mode=diff",
                "palette.png"], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS),
                "-i", "frames/%04d.png", "-i", "palette.png", "-lavfi",
                "paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", "demo.gif"], check=True)
print("gif:", pathlib.Path("demo.gif").stat().st_size // 1024, "KB")
