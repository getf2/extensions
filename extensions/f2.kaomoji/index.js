// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Kaomoji: Japanese text faces, in sets by feeling, found by what's typed
// ("kao shrug") through each set's words. Bundled: nothing's fetched.

// Each set: its name, the words it's found by, what it's said as when it's
// copied with a description, its symbol, and its kaomoji, two spaces or a
// line apart. (Raw, so a "\" is itself; "｀" stands in for a backtick.)
/** @type {[string, string, string, string, string][]} */
const SETS = [
  ["Happy", "happy smile smiling glad joy cheerful pleased content", "happy", "face.smiling", String.raw`
(＾▽＾)  (◕‿◕)  (◠‿◠)  (＾ｖ＾)  (￣▽￣)  (*^‿^*)  (✿◠‿◠)  (｡◕‿◕｡)  (´∀｀)  (*´▽｀*)  (o^▽^o)  (⌒‿⌒)
(＾◡＾)  (◕ᴗ◕✿)  (* ^ ω ^)  (´• ω •｀)  (o˘◡˘o)  ٩(◕‿◕｡)۶  (◡‿◡✿)  (≧◡≦)  (*¯︶¯*)  (˶ᵔ ᵕ ᵔ˶)  (ᵔ◡ᵔ)  ( ˊᵕˋ )
`],
  ["Excited", "excited yay hooray woohoo celebrate cheer party joy", "excited", "party.popper.fill", String.raw`
＼(＾▽＾)／  \(^o^)/  ヽ(・∀・)ﾉ  ٩(ˊᗜˋ*)و  ☆*:.｡.o(≧▽≦)o.｡.:*☆  (≧▽≦)  (ﾉ´ヮ｀)ﾉ*: ･ﾟ  ヽ(>∀<☆)ノ
o(≧▽≦)o  (๑˃ᴗ˂)ﻭ  ٩(＾ᴗ＾)۶  \(★ω★)/  (★^O^★)  ⸜(｡˃ ᵕ ˂ )⸝  (ノ^∇^)ノ  \(￣▽￣)/
`],
  ["Love", "love heart adore crush affection romance", "in love", "heart.fill", String.raw`
(♡°▽°♡)  (´｡• ᵕ •｡｀) ♡  (｡♥‿♥｡)  (◍•ᴗ•◍)♡  (♥ω♥*)  (*♡∀♡)  (灬º‿º灬)♡  ♡( ◡‿◡ )  (ღ˘⌣˘ღ)
(✿ ♥‿♥)  (´∩｡• ᵕ •｡∩｀) ♡  (´ ω ｀♡)  ♡＼(￣▽￣)／♡  (●♡∀♡)  (◕‿◕)♡  (≧◡≦) ♡
`],
  ["Kiss", "kiss kissing smooch mwah", "blowing a kiss", "mouth.fill", String.raw`
( ˘ ³˘)♥  (っ˘з(˘⌣˘ )  (´ε｀ )♡  (*˘︶˘*).｡.:*♡  (ˆ ³ˆ)♥  (づ￣ ³￣)づ  ( ˘⌣˘)♡(˘⌣˘ )  (￣ε￣＠)
(ﾉ´ з ｀)ノ  (*^3^)/~♡  (˘ε˘)  (*￣3￣)╭
`],
  ["Blushing", "blush blushing shy embarrassed flustered bashful", "blushing", "face.smiling.inverse", String.raw`
(⁄ ⁄•⁄ω⁄•⁄ ⁄)  (*/ω＼*)  (〃▽〃)  (*^.^*)  (///▽///)  (⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)  (*ﾉ▽ﾉ)  (✿╹◡╹)  (//ω//)
(*/▽＼*)  (⸝⸝⸝°_°⸝⸝⸝)  (ꈍᴗꈍ)  (o^ ^o)  (〃ω〃)  (*ﾉωﾉ)  („ಡωಡ„)
`],
  ["Winking", "wink winking flirt", "winking", "eye.fill", String.raw`
(^_~)  (｡•̀ᴗ-)✧  (＾_−)☆  (・ω<)  (~_^)  (^_-)-☆  (o^_-)b  (>ω^)  ☆⌒(ゝ。∂)  (^_-)≡☆  (ゝω・)  (-‿◦)
(◕‿-)  (^_<)〜☆
`],
  ["Sad", "sad unhappy down blue disappointed gloomy sorry", "sad", "cloud.rain.fill", String.raw`
(´･_･｀)  (︶︹︺)  (｡•́︿•̀｡)  (´・ω・｀)  (._.)  (｡ŏ﹏ŏ)  (◞‸◟)  (｡╯︵╰｡)  (︶︹︶)  (´-ω-｀)
( ´•︵•｀ )  (ノ_<。)  (っ- ‸ – ς)  (◡︿◡)  ( ˘︹˘ )
`],
  ["Crying", "cry crying tears sob sobbing weep upset", "crying", "drop.fill", String.raw`
(╥﹏╥)  (ಥ﹏ಥ)  (T_T)  (ToT)  (ಥ_ಥ)  (´；ω；｀)  (つ﹏<。)  (｡T ω T｡)  (இ﹏இ)  ・゜・(ノД｀)・゜・
(T▽T)  (┳Д┳)  (╯︵╰,)  o(TヘTo)  (ᗒᗣᗕ)  (〒︿〒)  (╥_╥)  (；へ：)
`],
  ["Angry", "angry mad furious rage annoyed grumpy cross", "angry", "flame.fill", String.raw`
(╬ Ò﹏Ó)  (｀Д´)  (＃｀Д´)  ヽ(｀⌒´メ)ノ  (ノ°益°)ノ  (￣^￣)  (ಠ益ಠ)  (＾＾＃)  (｀ε´)  ヽ(＃｀Д´)ﾉ
(￣ヘ￣)  凸(￣ヘ￣)  ٩(╬ʘ益ʘ╬)۶  (｀皿´＃)  (¬_¬")  (╬￣皿￣)  (҂｀ﾛ´)凸  ψ(｀∇´)ψ  (｀Д´)ﾉ
`],
  ["Unimpressed", "disapproval disapproving unimpressed stare judging look meh side-eye", "disapproving look", "eyes", String.raw`
ಠ_ಠ  (ಠ_ಠ)  (¬_¬)  (￢_￢)  (눈_눈)  (;¬_¬)  ఠ_ఠ  (ー_ー)  (︶^︶)  (→_→)  (←_←)  (-_-)  -_-
(￣_￣)  (－－〆)  (ㆆ_ㆆ)  (¬､¬)  (≖_≖ )
`],
  ["Facepalm", "facepalm ugh sigh embarrassed", "facepalm", "hand.raised.fill", String.raw`
(－‸ლ)  (ლ‸－)  (／。＼)  (>ლ)  (ノ_・。)  ლ(￣ロ￣ლ)
`],
  ["Surprised", "surprised shocked wow omg astonished gasp whoa", "surprised", "exclamationmark.2", String.raw`
(°o°)  (⊙_⊙)  (O_O)  Σ(°ロ°)  w(°ｏ°)w  (◎_◎;)  ∑(O_O;)  (⊙ˍ⊙)  (*ﾟﾛﾟ)  Σ(ﾟДﾟ)  (☉_☉)  (O.O)
ヽ(°〇°)ﾉ  (o_O)  (°△°|||)  (ﾟοﾟ人))  (゜o゜)  (⊙０⊙)  Σ(O_O)
`],
  ["Scared", "scared afraid fear frightened terrified horror spooky", "scared", "exclamationmark.triangle.fill", String.raw`
(ﾉωヽ)  (;;;*_*)  〜(＞＜)〜  ヾ(｡＞﹏＜｡)ﾉﾞ  (;ﾟДﾟ)  (||ﾟДﾟ)  (・□・;)  (⊙﹏⊙)  Σ(っ °Д °;)っ  (;°Д°)
\(〇_ｏ)/  (((;ꏿ_ꏿ;)))  (ﾟДﾟ;)  (ノдヽ)  (((ﾟДﾟ;)))  (ﾉ>ω<)ﾉ  ＼(º □ º l|l)/
`],
  ["Nervous", "nervous worried anxious sweat sweating awkward uneasy oops", "nervous sweat", "exclamationmark.bubble.fill", String.raw`
(^_^;)  (；一_一)  (￣▽￣;)  (-_-;)  (・_・;)  (⌒_⌒;)  (ﾟ∀ﾟ;)  (￣～￣;)  (°_°;)  (；・∀・)  (^▽^;)
(・・;)  (；´∀｀)  (；￣Д￣)  (￣ー￣;)  (〃￣ω￣〃ゞ  (°ー°〃)  (⌒▽⌒;)  ^^;
`],
  ["Confused", "confused puzzled huh what lost thinking hmm wondering", "confused", "questionmark", String.raw`
(・・ ) ?  (・_・ヾ  (°ヘ°)  (⊙_☉)  (@_@)  (°.°)  (・・?  (・∧‐)ゞ  (＠_＠;)  (¯ . ¯٥)  (⊙_◎)
ლ(ಠ_ಠ ლ)  (。ヘ°)  ヽ(゜～゜o)ノ  (゜-゜)  (￣～￣)  ( ˘･з･)  (◔_◔)  (・ω・)？  ( ¯•ω•¯ )  (´-ι_-｀)
`],
  ["Shrug", "shrug shrugging whatever dunno idk meh", "shrug", "questionmark.circle.fill", String.raw`
¯\_(ツ)_/¯  ┐(￣ヘ￣)┌  ╮(￣～￣)╭  ┐(´д｀)┌  ┐(￣ー￣)┌  ヽ(ー_ー )ノ  ╮(︶▽︶)╭  ʅ(°_°)ʃ  ┐(︶▽︶)┌
¯\_(⊙_ʖ⊙)_/¯  ¯\(°_o)/¯  ヽ(´ー｀)┌  ╮(─▽─)╭  ¯\_(ಠ_ಠ)_/¯  ʅ(◞‿◟)ʃ  ╮(╯▽╰)╭  ¯\_(◉‿◉)_/¯
┐( ˘_˘ )┌  ¯\_( ͡° ͜ʖ ͡°)_/¯
`],
  ["Table Flip", "table flip flipping tableflip rage angry", "flipping a table", "table.furniture.fill", String.raw`
(╯°□°)╯︵ ┻━┻  (ノಠ益ಠ)ノ彡┻━┻  ┻━┻ ︵ヽ(｀Д´)ﾉ︵ ┻━┻  (┛ಠ_ಠ)┛彡┻━┻  (ﾉ°Д°)ﾉ︵ ┻━┻  (ノ°益°)ノ彡┻━┻
(╯ರ ~ ರ)╯︵ ┻━┻  (┛◉Д◉)┛彡┻━┻  ┻━┻ミ＼(≧ﾛ≦＼)  (ﾉ｀□´)ﾉ⌒┻━┻  (ノ ゜Д゜)ノ ︵ ┻━┻  (ノಥ益ಥ)ノ ┻━┻
(╯°□°)╯︵ ┻━┻ ︵ ╯(°□° ╯)  (╯°Д°)╯︵ /(.□ . \)  ʕノ•ᴥ•ʔノ ︵ ┻━┻
`],
  ["Table Back", "table unflip calm sorry putting back fix", "putting the table back", "table.furniture", String.raw`
┬─┬ノ( º _ ºノ)  ┬─┬ ノ( ゜-゜ノ)  ┬──┬◡ﾉ(° -°ﾉ)  (ヘ･_･)ヘ┳━┳  ┬─┬ノ(ಠ_ಠノ)
`],
  ["Hugging", "hug hugging hugs cuddle embrace comfort", "hug", "figure.2.arms.open", String.raw`
(っ´▽｀)っ  (づ｡◕‿‿◕｡)づ  (つ≧▽≦)つ  ⊂(◉‿◉)つ  (っ◕‿◕)っ  (⊃｡•́‿•̀｡)⊃  ⊂(・▽・⊂)  (づ◡﹏◡)づ
⊂(´• ω •｀⊂)  (つ ͡° ͜ʖ ͡°)つ  (っಠ‿ಠ)っ  (づ ◕‿◕ )づ  (つ✧ω✧)つ  ⊂(￣▽￣)⊃  (っ＾▿＾)っ  (⊃・ᴗ・)⊃
`],
  ["Greeting", "hi hello hey wave waving greeting greetings bye goodbye", "waving", "hand.wave.fill", String.raw`
(^_^)/  (￣▽￣)ノ  ヾ(＾∇＾)  (*・ω・)ﾉ  (^o^)/  ヾ(・ω・*)  (｡･∀･)ﾉﾞ  (＾▽＾)/  ヾ(☆▽☆)  (°▽°)/
( ´ ▽ ｀ )ﾉ  (￣ω￣)/  (o´▽｀o)ﾉ  ヾ(＾▽＾*)))  (・∀・)ノ  (^-^*)/  (・ω・)ノ  ヾ(•ω•｀)o  (｡･ω･)ﾉﾞ
(ﾉ´▽｀)ﾉ  ヾ(￣▽￣) Bye~Bye~  (TωT)ﾉ~  (^^)/~~~
`],
  ["Sleepy", "sleepy sleep sleeping tired yawn night goodnight bed zzz nap", "sleepy", "moon.zzz.fill", String.raw`
(－_－) zzZ  (∪｡∪)｡｡｡zzZ  (￣o￣) zzZZzzZZ  (ᴗ˳ᴗ)  (-_-) zzz  (＿ ＿*) Z z z  (-.-)Zzz...  (´〜｀*) zzz
(￣ρ￣)..zzZZ  (ᴗ_ ᴗ。)  (-ω-) zzZ  (｡-ω-)zzz  [(－－)]..zzZ  (*´ο｀*)  (｡ᵕ ᴗ ᵕ｡)zᶻ  (ᵕ—ᴗ—)  ( ˘ω˘ )ｽﾔｧ
`],
  ["Smug", "smug lenny proud cool sly sunglasses deal", "smug", "sunglasses.fill", String.raw`
( ͡° ͜ʖ ͡°)  ( ͡~ ͜ʖ ͡°)  (￣ー￣)  (¬‿¬)  (⌐■_■)  (•_•) ( •_•)>⌐■-■ (⌐■_■)  ( •_•)>⌐■-■  (ˇ‿ˇ)
(￢‿￢ )  (ಠ‿ಠ)  (￣‿￣)  (¬‿¬)σ  (⌐□_□)  (‾◡◝)
`],
  ["Dancing", "dance dancing party music groove sing singing song", "dancing", "figure.dance", String.raw`
♪┏(・o･)┛♪┗ ( ･o･) ┓♪  ┏(＾0＾)┛┗(＾0＾) ┓  ヾ(⌐■_■)ノ♪  ♪(┌・。・)┌  ♪～(￣ε￣)  ヽ(o⌒∇⌒o)ﾉ
(〜￣▽￣)〜  〜(￣▽￣〜)  ♪ヽ(^^ヽ)♪  (ﾉ≧∀≦)ﾉ  ┌(＾＾)┘  └(＾＾)┐  (~˘▽˘)~  ~(˘▽˘~)  ヘ(￣ー￣ヘ)
(ノ￣ー￣)ノ  \(ﾟｰﾟ\)  (/ﾟｰﾟ)/  ( ˘ ɜ˘) ♬♪♫  ♪♪ ヽ(ˇ∀ˇ )ゞ
`],
  ["Running", "run running hurry rush escape late zoom", "running", "figure.run", String.raw`
ε=ε=ε=┌(;*´Д｀)ﾉ  ε=┌( >_<)┘  ε=ε=ε=ε=┌(;￣▽￣)┘  ヽ(￣д￣;)ノ=3=3=3  C= C= C= ┌(｀ー´)┘
ε===(っ≧ω≦)っ  ε=ε=(ノ≧∇≦)ノ  ε=┏( >_<)┛  ᕕ( ᐛ )ᕗ  ε=ε=ε=(~￣▽￣)~  ヾ(￣□￣;)ﾉ
`],
  ["Fighting", "fight fighting punch boxing battle strong flex muscle determined ganbatte", "ready to fight", "figure.boxing", String.raw`
(ง •̀_•́)ง  (ง'̀-'́)ง  ᕦ(ò_óˇ)ᕤ  (•̀ᴗ•́)و  (•̀o•́)ง  ᕙ(⇀‸↼‶)ᕗ  ᕙ(｀▽´)ᕗ  ᕦ(ò_ó)ᕤ  <(｀^´)>
ヽ(#ﾟДﾟ)ﾉ┌┛Σ(ノ´Д｀)ノ  (ง ˙o˙)ว  ( •̀ω•́ )✧  o(｀ω´ )o
`],
  ["Magic", "magic sparkle sparkles wizard spell cast", "casting a spell", "wand.and.stars", String.raw`
(∩｀-´)⊃━☆ﾟ.*･｡ﾟ  (⊃｡•́‿•̀｡)⊃━☆ﾟ.*･｡ﾟ  (ノ°∀°)ノ⌒･*:.｡. .｡.:*･゜ﾟ･*☆  (*・‿・)ノ⌒*:･ﾟ✧
(ﾉ≧∀≦)ﾉ ‥…━━━★  ✧*｡٩(ˊᗜˋ*)و✧*｡  (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧
`],
  ["Food", "food eat eating hungry yum delicious drool tea coffee drink cake", "eating", "fork.knife", String.raw`
(っ˘ڡ˘ς)  ( ˘▽˘)っ♨  (ˉ﹃ˉ)  (￣﹃￣)  (*￣▽￣)旦  (o˘◡˘o)┌iii┐  (*´ڡ｀●)  (*´﹃｀*)  (っ˘ω˘ς )  (＾～＾)
`],
  ["Bowing", "bow bowing sorry apology apologize please thanks thank respect salute", "bowing", "hands.and.sparkles.fill", String.raw`
m(_ _)m  (シ_ _)シ  <(_ _)>  m(._.)m  (シ. .)シ  m(＿ ＿)m  (_ _)  (￣^￣)ゞ  m(｡≧ｴ≦｡)m  (ㅅ´ ˘ ｀)
`],
  ["Defeated", "defeated despair dead fail failed give up exhausted done orz", "defeated", "xmark.circle.fill", String.raw`
orz  OTL  _(:3 」∠)_  _(┐「ε:)_  ＿|￣|○  (×_×)  (x_x)  (+_+)  (×﹏×)  (✖╭╮✖)
`],
  ["Peace", "peace victory v-sign win yay", "peace sign", "checkmark.seal.fill", String.raw`
(￣▽￣)V  (＾＿＾)v  ✌(◕‿-)✌  (^_^)v  v(｡･ω･｡)  ✌(-‿-)✌
`],
  ["Peeking", "peek peeking hide hiding lurk lurking spy", "peeking", "eyes", String.raw`
|ω･)  |д･)  ┬┴┬┴┤･ω･)ﾉ  |･ω･｀)  ┬┴┬┴┤(･_├┬┴┬┴  |ʘ‿ʘ)╯  (・_|  |_・)
`],
  ["Bears", "bear bears teddy", "bear", "teddybear.fill", String.raw`
ʕ•ᴥ•ʔ  ʕ·ᴥ·ʔ  ʕ ᵔᴥᵔ ʔ  (ᵔᴥᵔ)  ʕ•̀ω•́ʔ✧  ʕ ꈍᴥꈍʔ  ʕっ•ᴥ•ʔっ  ʕ￫ᴥ￩ʔ  ʕ•ᴥ•ʔﾉ♡  ʕ≧ᴥ≦ʔ  ʕ ˵• ₒ •˵ ʔ
(*￣(ｴ)￣*)  (／(ｴ)＼)  (￣(ｴ)￣)ﾉ  ʕ •ₒ• ʔ  ʕ ºᴥºʔ
`],
  ["Cats", "cat cats kitty kitten meow neko", "cat", "cat.fill", String.raw`
(=^･ω･^=)  (=^‥^=)  (^・ω・^ )  (=ↀωↀ=)  (=①ω①=)  ฅ^•ﻌ•^ฅ  (=^-ω-^=)  (=´∇｀=)  (=｀ω´=)  (^._.^)ﾉ
(=ＴェＴ=)  ᓚᘏᗢ  (=^･ｪ･^=)  (ΦωΦ)  (^˵◕ω◕˵^)  =^..^=  ฅ(•ㅅ•❀)ฅ  /ᐠ｡ꞈ｡ᐟ\  /ᐠ - ˕ -マ  (=^ ◡ ^=)
ฅ(^◕ᴥ◕^)ฅ
`],
  ["Dogs", "dog dogs puppy doggo woof inu", "dog", "dog.fill", String.raw`
∪･ω･∪  ∪＾ェ＾∪  (❍ᴥ❍ʋ)  U・ᴥ・U  ▼・ᴥ・▼  (U・x・U)  V●ᴥ●V  U^ｪ^U  ∪￣-￣∪  (◕ᴥ◕ʋ)  ໒( ● ᴥ ●)ʋ
(ᐡ•ﻌ•ᐡ)  U・ﻌ・U  ૮ ・ﻌ・ა  ᐡ ᐧ ﻌ ᐧ ᐡ  ▽・ｪ・▽
`],
  ["Rabbits", "rabbit rabbits bunny bunnies usagi", "rabbit", "hare.fill", String.raw`
／(・ × ・)＼  ／(≧ x ≦)＼  ／(=・ x ・=)＼  ／(^ x ^)＼  ／(￣x￣)＼  (・x・)  (*・x・)  ૮ ˶ᵔ ᵕ ᵔ˶ ა
૮₍ ˶ᵔ ᵕ ᵔ˶ ₎ა
`],
  ["Pigs", "pig pigs piggy oink", "pig", "pawprint.fill", String.raw`
(￣(oo)￣)ﾉ  ( ´(00)ˋ )  (^(OO)^)
`],
  ["Birds", "bird birds chick tweet penguin", "bird", "bird.fill", String.raw`
(・θ・)  (￣Θ￣)  (°<°)  (・Θ・)  (・⊝・)  ( •ө• )
`],
  ["Fish", "fish sea ocean octopus squid", "fish", "fish.fill", String.raw`
<・ )))><<  >°)))彡  ><((((>  <°)))><  くコ:彡  C:。ミ
`],
  ["Spiders", "spider spiders bug creepy", "spider", "ant.fill", String.raw`
/╲/\╭(ఠఠ益ఠఠ)╮/\╱\  /╲/\╭(•‿•)╮/\╱\
`],
]

f2.command("kaomoji", () => {
  f2.show({
    items: SETS.flatMap(([name, words, what, icon, list]) =>
      list
        .split(/ {2,}|\n/)
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => ({
          title: k,
          icon,
          section: name,
          keywords: words.split(" "),
          actions: [
            { title: "Copy", copy: k, icon: "doc.on.doc" },
            { title: "Copy with Description", copy: `${k} (${what})`, icon: "text.quote" },
          ],
        })),
    ),
    placeholder: "Search by feeling: happy, shrug, table flip, cat…",
    loading: false,
  })
})
