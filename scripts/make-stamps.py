from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import math,random
out=Path('public/stamps');out.mkdir(exist_ok=True)
f=ImageFont.truetype('public/fonts/PressStart2P-Regular.ttf',6)
small=ImageFont.truetype('public/fonts/PTMono-Regular.ttf',8)
keys=['steam','portal','lambda','blocks','rave','nosignal','cat','disc','bass','web','save','moon']
colors=['#a6c3d7','#69d6fc','#efa552','#81bb69','#f198d3','#b9ef79','#c6b4ed','#afc5dc','#dfc16b','#8cbaa3','#d7cbb3','#9eace6']
def center(d,txt,y,font=f,fill='white'):
 w=d.textbbox((0,0),txt,font=font)[2];d.text(((88-w)//2,y),txt,font=font,fill=fill)
for key,col in zip(keys,colors):
 frames=[]
 for t in range(8):
  im=Image.new('RGB',(88,44),'#20231f');d=ImageDraw.Draw(im)
  d.rectangle((1,1,86,42),fill='#d2d2c6');d.rectangle((3,3,84,40),fill='#111713',outline=col)
  for x in range(0,88,4):d.rectangle((x,0,x+1,1),fill='#20231f');d.rectangle((x,42,x+1,43),fill='#20231f')
  for y in range(0,44,4):d.point((0,y),fill='#20231f');d.point((87,y),fill='#20231f')
  for y in range(5,40,3):d.line((5,y,82,y),fill='#202820')
  if key=='steam':
   d.ellipse((10,11,24,25),outline=col,width=2);d.ellipse((26,6,38,18),outline=col,width=2);d.line((20,20,31,13),fill=col,width=3)
   d.text((42,11),'STEAM',font=f,fill=col);center(d,'ONE MORE GAME',30,small,col)
   d.point((36+t*5,24),fill=col)
  elif key=='portal':
   d.ellipse((12,8+t%2,26,29),outline='#58c9ee',width=2);d.ellipse((61,8-t%2,75,29),outline='#f3aa49',width=2)
   d.rectangle((30+t*3,18,34+t*3,22),fill='#cbd5cd');center(d,'STILL ALIVE',31,small,col)
  elif key=='lambda':
   d.ellipse((6,7,33,33),outline=col,width=2);d.line((14,12,19,12,26,28),fill=col,width=2);d.line((20,17,14,29),fill=col,width=2)
   d.text((39,10),'HALF-',font=f,fill=col);d.text((39,20),'LIFE',font=f,fill=col);d.rectangle((40,31,45+t*4,33),fill=col)
  elif key=='blocks':
   d.polygon([(13,16),(27,8),(41,16),(27,24)],fill='#81aa52');d.polygon([(13,16),(27,24),(27,34),(13,26)],fill='#5e613c');d.polygon([(27,24),(41,16),(41,26),(27,34)],fill='#8c7651')
   for x in range(16,38,6):d.point((x,17),fill='#c3d78b')
   d.text((47,11),'BUILD',font=f,fill=col);d.text((47,22),'MINE',font=f,fill=col);d.point((65+t,7),fill='white')
  elif key=='rave':
   for x in range(7,82,5):
    h=3+int((math.sin(x*.7+t*.8)+1)*7);d.rectangle((x,32-h,x+2,32),fill=col)
   center(d,'RAVE',8,fill=col);center(d,'ALL NIGHT',33,small,col)
  elif key=='nosignal':
   rng=random.Random(t+3)
   for _ in range(140):x=rng.randrange(5,83);y=rng.randrange(5,39);d.point((x,y),fill=rng.choice(['#37463c','#53624d','#839775']))
   d.rectangle((9,14,79,28),fill='#101610');center(d,'NO SIGNAL',18,fill=col)
  elif key=='cat':
   d.polygon([(28,16),(28,7),(36,12),(50,12),(59,7),(59,28),(28,28)],fill=col)
   for x in (35,50):d.rectangle((x,18,x+2,18 if t==6 else 21),fill='#191a24')
   d.point((44,23),fill='#191a24');center(d,'CAT ONLINE',32,small,col)
  elif key=='disc':
   d.ellipse((10,6,38,34),fill='#a6b4b2',outline='white');d.ellipse((21,17,27,23),fill='#15201b')
   a=t*math.pi/4;d.line((24,20,24+int(13*math.cos(a)),20+int(13*math.sin(a))),fill='#ea9cd5',width=2)
   d.text((44,10),'COMPACT',font=small,fill=col);d.text((44,20),'DISC',font=f,fill=col);d.text((43,31),'AUDIO',font=small,fill=col)
  elif key=='bass':
   for x in (9,59):
    d.rectangle((x,8,x+20,35),fill='#313a2b',outline=col);r=7+(t%3==0);d.ellipse((x+10-r,22-r,x+10+r,22+r),outline=col,width=2)
   d.text((32,10),'B',font=f,fill=col);d.text((32,20),'A',font=f,fill=col);d.text((32,30),'SS',font=f,fill=col)
  elif key=='web':
   d.ellipse((8,8,31,31),outline=col);d.ellipse((15,8,24,31),outline=col);d.line((8,20,31,20),fill=col);d.line((10,14,29,14),fill=col)
   d.text((38,10),'THE WEB',font=f,fill=col);d.text((38,23),'IS YOURS',font=small,fill=col);d.point((12+t*2,33),fill=col)
  elif key=='save':
   d.rectangle((10,8,32,33),fill=col);d.rectangle((15,8,27,17),fill='#323b2c');d.rectangle((14,23,28,33),fill='#eef1d4');d.line((17,26,25,26),fill='#606554')
   d.text((40,9),'SAVE',font=f,fill=col);d.text((40,20),'YOUR',font=f,fill=col);d.text((40,31),'MUSIC',font=f,fill=col);d.point((75,8+t),fill=col)
  else:
   d.ellipse((11,7,34,30),fill=col);d.ellipse((19,4,39,25),fill='#111713')
   for x,y in [(45,8),(72,15),(37,28)]:d.line((x-1,y,x+1,y),fill=col if t%3 else '#555f75');d.point((x,y-1),fill=col)
   center(d,'NIGHT LISTENER',33,small,col)
  frames.append(im)
 frames[0].save(out/(key+'.png'))
 frames[0].save(out/(key+'.gif'),save_all=True,append_images=frames[1:],duration=180,loop=0,optimize=False)
print('12 original animated GIF stamps + still versions created')
