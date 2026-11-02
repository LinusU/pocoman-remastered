import sys, os, json
from PIL import Image
import numpy as np
from scipy import ndimage
SRC='/Users/linus/coding/pocoman-remastered/refs/sprite-sheet.webp'
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
im=np.array(Image.open(SRC).convert('RGB')).astype(float)

def cut(box, tol=38, feather=22, trim=False):
    x0,y0,x1,y1=box
    reg=im[y0:y1,x0:x1]
    border=np.concatenate([reg[0],reg[-1],reg[:,0],reg[:,-1]])
    ref=np.median(border,0)
    d=np.sqrt(((reg-ref)**2).sum(-1))
    cand=d<tol+feather
    lab,_=ndimage.label(cand)
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bg=np.isin(lab,list(edge))
    alpha=np.ones(d.shape)
    alpha[bg]=np.clip((d[bg]-tol)/feather,0,1)
    # drop tiny islands
    solid=alpha>0.5
    lab2,n=ndimage.label(solid)
    if n>1:
        sizes=ndimage.sum(solid,lab2,range(1,n+1))
        keep=np.isin(lab2,[i+1 for i,s in enumerate(sizes) if s>=0.2*sizes.max()])
        alpha[~ndimage.binary_dilation(keep,iterations=2)]=0
    rgba=np.dstack([reg,alpha*255]).clip(0,255).astype(np.uint8)
    img=Image.fromarray(rgba,'RGBA')
    if trim: img=img.crop(img.getbbox())
    return img

# player: rows right,left,down,up ; cols x-centers
rows={'right':180,'left':250,'down':322,'up':397}
walkx=[142,215,290,362]; pushx=[462,535,607,680]
for name,cy in rows.items():
    for i,cx in enumerate(walkx):
        cut((cx-36,cy-40,cx+36,cy+34)).save(f'{OUT}/walk_{name}_{i}.png')
    for i,cx in enumerate(pushx):
        cut((cx-40,cy-40,cx+40,cy+34)).save(f'{OUT}/push_{name}_{i}.png')

# tiles: square floor cuts (inner, no bg)
for n,cx in [('floor_a',64),('floor_b',148),('floor_c',230),('goal',313)]:
    Image.fromarray(im[548:604,cx-28:cx+28].astype(np.uint8)).save(f'{OUT}/{n}.png')
for n,(a,b) in [('wall_front',(362,442)),('wall_top',(452,535)),('wall_inner',(540,622)),('wall_outer',(630,715)),('wall_end',(728,800))]:
    cut((a,515,b,612),tol=80,trim=True).save(f'{OUT}/{n}.png')
for n,cx in [('gem_blue',875),('gem_red',946),('gem_green',1018),('gem_yellow',1089),('gem_purple',1158),('crate',1230),('stone',1310)]:
    cut((cx-38,540,cx+38,615),trim=True).save(f'{OUT}/{n}.png')
