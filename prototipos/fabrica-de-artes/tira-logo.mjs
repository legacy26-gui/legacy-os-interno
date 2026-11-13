import sharp from "sharp";
const F = "/tmp/claude-0/-home-user-legacy-os-interno/1d1b326c-8b67-54a3-aaf1-a5cdf3a09168/images/37.jpg";
const { data, info } = await sharp(F).extract({left:170,top:20,width:830,height:290})
  .resize(1400).raw().toBuffer({resolveWithObject:true});
const { width:L, height:A, channels:C } = info;
const out = Buffer.alloc(L*A*4);
for (let p=0;p<L*A;p++){
  const r=data[p*C], g=data[p*C+1], b=data[p*C+2];
  // o quanto o pixel é vermelho e não cinza. O banner é preto fosco com
  // reflexo acinzentado: reflexo tem R≈G≈B e cai fora sozinho.
  const vermelhidao = r - Math.max(g,b);
  const a = Math.max(0, Math.min(255, (vermelhidao - 18) * 4));
  out[p*4]=232; out[p*4+1]=30; out[p*4+2]=45; out[p*4+3]=a;
}
await sharp(out,{raw:{width:L,height:A,channels:4}}).trim({threshold:8}).png().toFile("logo-area42.png");
const m = await sharp("logo-area42.png").metadata();
console.log("logo:", m.width+"x"+m.height);
// conferir sobre preto e sobre branco
await sharp("logo-area42.png").flatten({background:"#111111"}).resize(600).png().toFile("logo-no-preto.png");
