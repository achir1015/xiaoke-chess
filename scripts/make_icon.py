# 產生程式圖示（紅「帥」棋子）
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).ellipse((90, 120, S - 70, S - 40), fill=(0, 0, 0, 150))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(24)))
d = ImageDraw.Draw(img)
d.ellipse((64, 64, S - 64, S - 64), fill=(179, 36, 44, 255))           # 側邊紅
d.ellipse((92, 80, S - 92, S - 104), fill=(246, 226, 184, 255))        # 面
for r, w in ((370, 26), (330, 9)):
    c = S // 2
    d.ellipse((c - r, c - 12 - r, c + r, c - 12 + r), outline=(200, 16, 46, 255), width=w)
font = None
for f in ('C:/Windows/Fonts/kaiu.ttf', 'C:/Windows/Fonts/msjhbd.ttc', '/System/Library/Fonts/Supplemental/Songti.ttc'):
    if os.path.exists(f):
        font = ImageFont.truetype(f, 520); break
d.text((S // 2, S // 2 - 20), '帥', font=font, fill=(200, 16, 46, 255), anchor='mm', stroke_width=8, stroke_fill=(200, 16, 46, 255))
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
img.save(os.path.join(ROOT, 'build', 'icon.png'))
img.save(os.path.join(ROOT, 'build', 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('ok')
