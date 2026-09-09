from pathlib import Path
import sys

from PIL import Image, ImageFilter


SOURCE = Path(r"C:\Users\BJB03643\Desktop\贴纸\画板 1.jpg")
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "quick-phrases"
BOXES = {
    "sustain-iteration": (300, 180, 1700, 1320),
    "think-different": (2250, 0, 3900, 1080),
    "capture-possibility": (1180, 1220, 2950, 2250),
    "passion-continues": (2680, 1300, 4195, 2800),
    "detail-feeling": (40, 1900, 1980, 3300),
    "change-continues": (1500, 2200, 3230, 3850),
    "redefine": (2500, 2750, 4195, 4400),
    "see-hear-more": (0, 3050, 2050, 5000),
    "think-do-more": (900, 3950, 3100, 5700),
    "new-angle": (2550, 3900, 4195, 5953),
}


def largest_component(mask):
    width, height = mask.size
    pixels = mask.load()
    seen = bytearray(width * height)
    largest = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not pixels[x, y]:
                continue
            stack = [(x, y)]
            seen[index] = 1
            component = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if 0 <= next_x < width and 0 <= next_y < height:
                        next_index = next_y * width + next_x
                        if not seen[next_index] and pixels[next_x, next_y]:
                            seen[next_index] = 1
                            stack.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component
    result = Image.new("L", (width, height), 0)
    result_pixels = result.load()
    for x, y in largest:
        result_pixels[x, y] = 255
    return result


def regenerate(name, source):
    crop = source.crop(BOXES[name])
    width, height = crop.size
    small = crop.resize((max(1, width // 5), max(1, height // 5)), Image.Resampling.LANCZOS)
    rough = Image.new("L", small.size, 0)
    small_pixels = small.load()
    rough_pixels = rough.load()
    for y in range(small.height):
        for x in range(small.width):
            red, green, blue = small_pixels[x, y]
            rough_pixels[x, y] = 255 if 255 - min(red, green, blue) > 13 else 0
    region = largest_component(rough.filter(ImageFilter.MaxFilter(21)))
    region = region.resize((width, height), Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(11))

    crop_pixels = crop.load()
    region_pixels = region.load()
    alpha = Image.new("L", (width, height), 0)
    alpha_pixels = alpha.load()
    for y in range(height):
        for x in range(width):
            if region_pixels[x, y]:
                red, green, blue = crop_pixels[x, y]
                alpha_pixels[x, y] = max(0, min(255, (255 - min(red, green, blue) - 2) * 22))

    solid = alpha.point(lambda value: 255 if value > 12 else 0)
    outline = solid.filter(ImageFilter.MaxFilter(35)).filter(ImageFilter.GaussianBlur(1.4))
    sticker = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    sticker.putalpha(outline)
    artwork = crop.convert("RGBA")
    artwork.putalpha(alpha)
    sticker.alpha_composite(artwork)

    content = sticker.crop(sticker.getchannel("A").getbbox())
    padding = 48
    final = Image.new("RGBA", (content.width + padding * 2, content.height + padding * 2), (0, 0, 0, 0))
    final.alpha_composite(content, (padding, padding))
    final.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.FLOYDSTEINBERG,
    ).save(OUTPUT / f"{name}.png", optimize=True)


source_image = Image.open(SOURCE).convert("RGB")
requested = sys.argv[1:] or list(BOXES)
for phrase_name in requested:
    regenerate(phrase_name, source_image)
