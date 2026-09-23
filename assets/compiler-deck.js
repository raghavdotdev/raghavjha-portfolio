/* ---------- starfield ---------- */
(function(){
  const c=document.getElementById('stars'),x=c.getContext('2d');let w,h,stars=[];
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){w=c.width=innerWidth*devicePixelRatio;h=c.height=innerHeight*devicePixelRatio;stars=[];for(let i=0;i<Math.min(420,(w*h)/9000);i++)stars.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.3+.2,p:Math.random()*6.28,s:.3+Math.random()});}
  function draw(t){x.clearRect(0,0,w,h);for(const s of stars){const a=reduce?.6:.35+.35*Math.sin(t/1400*s+s.p);x.globalAlpha=a;x.fillStyle=s.r>1.1?'#f2a93b':'#e8e2d4';x.beginPath();x.arc(s.x,s.y,s.r*devicePixelRatio,0,6.28);x.fill();}x.globalAlpha=1;if(!reduce)requestAnimationFrame(draw);}
  addEventListener('resize',size);size();draw(0);
})();

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>');
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return a;};
const sameSet=(a,b)=>a.length===b.length&&a.every(v=>b.includes(v));
const store={get(k,d){try{const v=localStorage.getItem('cdeck.'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('cdeck.'+k,JSON.stringify(v));}catch(e){}}};

/* ---------- content: the three sectors ---------- */
const G1=`E → E + T | E − T | T
T → T ∗ F | T / F | F
F → ( E ) | id`;
const G2=`E  → T E′
E′ → + T E′ | ε
T  → F T′
T′ → ∗ F T′ | ε
F  → 0 | 1 | ( E )`;
const G2FF=`FIRST(E)  = {0, 1, (}    FOLLOW(E)  = {$, )}
FIRST(E′) = {+, ε}       FOLLOW(E′) = {$, )}
FIRST(T)  = {0, 1, (}    FOLLOW(T)  = {+, $, )}
FIRST(T′) = {∗, ε}       FOLLOW(T′) = {+, $, )}
FIRST(F)  = {0, 1, (}    FOLLOW(F)  = {∗, +, $, )}`;
const NFA_ID=`NFA for id ::= letter(letter|digit)*   (Thompson)
0 —l→ 1 —ε→ 2 —l→ 3 —ε→ 6 —ε→ 7
       1 —ε→ 4 —d→ 5 —ε→ 6
       1 —ε→ 7        6 —ε→ 1
final: 7`;
const DFA_ID=`state   letter   digit   final
  A       B        —       N
  B       C        D       Y
  C       C        D       Y
  D       C        D       Y`;

const SECTORS=[
{ id:1, name:'Introduction to compilation', code:'SEC-01 · WEEK 1',
  blurb:'Assembler to Fortran to YACC. The pipeline of phases, the split between front end and back end, and the three ways a language gets executed.',
  log:['Pipeline assembly','Front end / back end sort','Execution-model triage','Phase identification'],
  items:[
   {t:'order',q:'Assemble the compiler pipeline. Tap the phases in the order the source code passes through them.',
    items:['lexical analysis','syntactic analysis','semantic analysis','high-level optimization','code generation','low-level optimization'],
    why:'Front end: lexical → syntactic → semantic → high-level optimization (producing intermediate code). Back end: code generation → low-level optimization. Each phase’s input is the previous phase’s output — a pipeline of filters.'},
   {t:'order',q:'Now the artifacts. Order what flows between the phases, from first to last.',
    items:['source code','token stream','syntax tree','annotated tree','intermediate code','target code','optimized target code'],
    why:'source code → (lexer) token stream → (parser) syntax tree → (semantic analysis) annotated tree → (high-level opt) intermediate code → (code gen) target code → (low-level opt) optimized target code.'},
   {t:'sort',q:'Sort each responsibility into the half of the compiler that owns it.',bins:['Front end','Back end'],
    items:[['Manages the symbol table','Front end'],['Heavily dependent on the target machine','Back end'],['Independent of the target machine','Front end'],['Low-level optimization','Back end'],['Builds the intermediate representation','Front end'],['Selects and schedules machine instructions','Back end'],['Driven mostly by the syntactic analyzer','Front end'],['Independent of the source language','Back end']],
    why:'The front end depends on the source language and is target-independent; it builds the IR and manages the symbol table. The back end depends on the target machine and is source-independent; it generates and optimizes target code.'},
   {t:'mc',q:'Java compiles to bytecode that is later executed by the JVM. Which implementation model is this?',
    opts:['Compilation','Interpretation','Compilation/interpretation hybrid','Just-in-time compilation only'],ans:2,
    why:'Hybrid: a compiler emits an intermediate representation (bytecode) that an interpreter executes. Python, Java, Perl and Ruby all use this bridge; Java compiles the IR once and for all.'},
   {t:'mc',q:'Early interpreters retranslated every line each time it was executed, even inside loops. What is the consequence the lecture points out?',
    opts:['Programs become platform-dependent','All analysis phases happen at run time, adding overhead','Type binding must happen at compile time','The symbol table cannot be built'],ans:1,
    why:'In pure interpretation all program-analysis phases must run at run time, which leads to unnecessary overhead. That is the main speed disadvantage; JIT compilation of hot sequences is the usual remedy.'},
   {t:'multi',q:'Which of these are easier to implement in an interpreter than in a compiler? Select all that apply.',
    opts:['Platform independence','Dynamic typing and polymorphism','Reflection','Maximum execution speed','Robustness against run-time failure'],ans:[0,1,2],
    why:'Interpretation eases platform independence (bytecode), reflection, and dynamic typing/polymorphism. Its disadvantages are slower execution and programs that are more likely to fail at run time.'},
   {t:'mc',q:'`000100000100111111` ⇔ `Add R1,R3,R15`. Why is an op-code table enough to translate assembly into machine code?',
    opts:['Assembly has no control structures','There is a one-to-one correspondence between assembly lines and machine words','Assembly is machine-independent','Assembly is parsed with a context-free grammar'],ans:1,
    why:'The assembler was the first compiler: a one-to-one direct translator. Each assembly line maps to exactly one machine word, so a table lookup suffices.'},
   {t:'mc',q:'Which phase performs type checking, static binding, and definite-assignment checks using the symbol table?',
    opts:['Lexical analysis','Syntactic analysis','Semantic analysis','Code generation'],ans:2,
    why:'Semantic analysis adds semantic information to the tree and uses the symbol table to validate it: type checking, static binding, definite assignment. Rules like these can’t be expressed by a context-free grammar alone — attribute grammars are used.'},
   {t:'mc',q:'A phase turns `t1=a; t2=y; t3=t1*t2; t4=z; t5=t3+t4; x=t5;` into `t1=a*y; x=t1+z;`. Which phase is this?',
    opts:['Semantic translation','High-level optimization','Code generation','Low-level optimization'],ans:1,
    why:'High-level optimization transforms the intermediate representation into a functionally equivalent but faster or smaller form — still target-independent. Low-level optimization works on generated target code and is architecture-dependent.'},
   {t:'mc',q:'Who led the team that built the first Fortran compiler at IBM in the 1950s — before compilation theory even existed?',
    opts:['Noam Chomsky','Stephen C. Johnson','John Backus','Donald Knuth'],ans:2,
    why:'John Backus at IBM (IBM Mathematical Formula Translating System, IBM 704, 1954). Chomsky gave us generative grammars and the Chomsky hierarchy; Stephen C. Johnson wrote YACC at Bell Labs in 1975.'},
   {t:'mc',q:'`Distance = rate * time;` becomes `[id, distance] [assignop, =] [id, rate] [multop, *] [id, time] [semi, ;]`. Which statement about this output is true?',
    opts:['It is a parse tree built by the parser','It is a token stream; each token pairs a category with a lexeme','It is intermediate code ready for the back end','It is the annotated tree from semantic analysis'],ans:1,
    why:'Lexical analysis converts a character stream into a token stream. Each token is a category (id, assignop, multop, semi) paired with the lexeme that matched it.'},
   {t:'mc',q:'In C++, which tool resolves cross-references between object files and produces the unified executable?',
    opts:['Preprocessor','Template metaprocessor','Library compiler','Linker'],ans:3,
    why:'The compiler is one part of a translation/linkage system. The preprocessor handles includes and macros, the template metaprocessor expands templates, the library compiler builds DLLs, and the linker resolves cross-references into one executable.'}
  ]},
{ id:2, name:'Lexical analysis', code:'SEC-02 · WEEK 2',
  blurb:'Regular expressions to NFA to DFA to a state-transition table, then a scanner that interprets it. Backtracking, ambiguity, and what counts as a lexical error.',
  log:['Tokenizer','Regex acceptance','Thompson & Rabin–Scott','Powerset construction trace','DFA execution','Table-driven scanner'],
  items:[
   {t:'sort',q:'Tokenize this line. Assign each lexeme its token class.',code:'if (max >= total) then max := total;',
    bins:['keyword','id','relop','assignop','openpar','closepar','semi'],
    items:[['if','keyword'],['(','openpar'],['max','id'],['>=','relop'],['total','id'],[')','closepar'],['then','keyword'],['max','id'],[':=','assignop'],['total','id'],[';','semi']],
    why:'A token is an element of the lexical definition; a lexeme is the character sequence recognized as one. `if`/`then` are keywords, `max`/`total` are ids, `>=` is a relop, `:=` an assignop, and the punctuation each gets its own class.'},
   {t:'multi',q:'`id ::= letter(letter|digit)*`. Which strings does this regular expression accept? Select all that apply.',
    opts:['`x`','`i2`','`2i`','`total42`','`_tmp`','`ab1c9`'],ans:[0,1,3,5],
    why:'The first character must be a letter; after that any mix of letters and digits, including none. `2i` starts with a digit and `_tmp` starts with an underscore, which is not in the alphabet.'},
   {t:'order',q:'Order the steps for designing a lexical analyzer — exactly what a scanner generator like Lex automates.',
    items:['write regular expressions for every valid token','derive an NFA from the REs','derive a DFA from the NFA','translate the DFA to a state transition table','implement the table','implement the algorithm that interprets the table'],
    why:'REs → NFA (Thompson’s construction) → DFA (Rabin–Scott powerset construction) → transition table → table implementation → table-driven algorithm.'},
   {t:'sort',q:'Match each algorithm to what it does.',bins:['RE → NFA','NFA → DFA','DFA → RE'],
    items:[['Thompson’s construction (1968)','RE → NFA'],['Rabin–Scott powerset construction (1959)','NFA → DFA'],['Kleene’s algorithm (1956)','DFA → RE']],
    why:'Ken Thompson: RE → NFA. Michael Rabin and Dana Scott: NFA → DFA by subset construction. Stephen Kleene: DFA → RE. Together they are the basis of every scanner generator.'},
   {t:'trace',q:'Run the powerset construction on the NFA for `id`. Compute each DFA state as an ε-closure.',code:NFA_ID,
    steps:[
     {p:'Start state A = ε-closure({0}) = ?',opts:['{0}','{0, 1}','{0, 1, 2, 4, 7}'],ans:0,why:'No ε-transitions leave state 0, so its closure is just {0}.'},
     {p:'moveDFA(A, letter) = ε-closure(moveNFA({0}, l)) = ε-closure({1}) = ?',opts:['{1}','{1, 2, 4, 7}','{1, 2, 3, 4, 5}'],ans:1,why:'From 1, ε reaches 2, 4 and 7. That set becomes state B.'},
     {p:'moveDFA(B, letter) = ε-closure({3}) = ?',opts:['{3, 6}','{1, 2, 3, 4, 6, 7}','{3, 6, 7}'],ans:1,why:'3 —ε→ 6 —ε→ 7 and 6 —ε→ 1 —ε→ 2, 4. So C = {1,2,3,4,6,7}.'},
     {p:'moveDFA(B, digit) = ε-closure({5}) = ?',opts:['{1, 2, 4, 5, 6, 7}','{5, 6}','{1, 2, 3, 4, 6, 7}'],ans:0,why:'5 —ε→ 6, then 6 reaches 7 and 1, 2, 4. So D = {1,2,4,5,6,7}.'},
     {p:'Which DFA states are final?',opts:['Only A','B, C and D','Only C and D'],ans:1,why:'A DFA state is final if it contains an NFA final state. B, C and D all contain 7. A single letter is already a valid id.'}
    ],why:'Each DFA state is a set of NFA states; ε-closure adds everything reachable by ε moves. Moves from C and D loop back to C (letter) and D (digit), so the DFA has four states.'},
   {t:'trace',q:'Now drive the finished DFA over the input `k9z`. Pick the state after each character.',code:DFA_ID,
    steps:[
     {p:'Start in A. Read `k` (letter) →',opts:['A','B','C','D'],ans:1,why:'A on letter goes to B.'},
     {p:'In B. Read `9` (digit) →',opts:['B','C','D','error'],ans:2,why:'B on digit goes to D.'},
     {p:'In D. Read `z` (letter) →',opts:['B','C','D','error'],ans:1,why:'D on letter goes to C.'},
     {p:'End of input in C. Verdict?',opts:['Accept: `k9z` is an id','Reject: C is not final','Reject: input ended early'],ans:0,why:'C is a final state, so the whole string is recognized as one id token.'}
    ],why:'A table-driven scanner is exactly this: state = table(state, lookup) until a final state is reached, then createToken.'},
   {t:'mc',q:'Reading `x<1`, the scanner only knows `<` is complete once it sees `1`. What must it do next?',
    opts:['Report a lexical error','Emit `<1` as one token','Back up one character so `1` starts the next token','Ask the parser to decide'],ans:2,
    why:'Backtracking: a token is normally recognized only when the next character is read. If that character belongs to the next token, backupChar() is called. The table encodes this in its backtrack column.'},
   {t:'mc',q:'In the table-driven scanner, which final states have backtrack = yes?',code:'…\n 3   yes [ id ]        yes\n 7   yes [ cmt ]       no\n 9   yes [ openpar ]   no\n14   yes [ assgn ]     no\n21   yes [ colon ]     yes\n22   yes [ lt ]        yes',
    opts:['Tokens whose lexeme is a single fixed character','Tokens recognized only after reading a character that is not part of them','Tokens that appear inside comments','Tokens longer than one character'],ans:1,
    why:'`id`, `num`, `colon`, `lt`, `gt` are recognized on the first character that does not belong to them, so that character must be pushed back. `:=`, `<=`, `(`, `}`-terminated comments end on their own last character — no backtrack.'},
   {t:'mc',q:'`n-1` — is it `<n><-><1>` or `<n><-1>`? Which is NOT one of the lecture’s proposed solutions?',
    opts:['Postpone the decision to the syntactic analyzer','Disallow sign prefixes on numbers in the lexical specification','Interact with the syntactic analyzer','Always prefer the longest match and reject the program otherwise'],ans:3,
    why:'The three options given: leave it to the parser, forbid signed numeric literals lexically, or couple lexer and parser (which induces coupling). Rejecting the program is not one of them.'},
   {t:'mc',q:'The scanner meets an invalid character, reports an error, and keeps skipping characters until a valid one appears. Which recovery technique is this?',
    opts:['Panic mode','Guess mode','Backtracking','Syntax-directed translation'],ans:0,
    why:'Panic mode: output an error and resume tokenization. Guess mode pattern-matches erroneous strings against valid ones (beggin → begin) and is rarely implemented because it confuses users.'},
   {t:'sort',q:'Match each implementation approach to its trade-off.',bins:['Generator (Lex)','Table-driven','Hand-written'],
    items:[['Safe and quick, but often can’t handle unusual situations','Generator (Lex)'],['One universal algorithm; building the table by hand is tedious and error-prone','Table-driven'],['Can be optimized and handles anything, but error-prone and hard to maintain','Hand-written']],
    why:'Lex: + safe, quick; − must learn the tool. Table-driven: + general and adaptable; − table construction. Hand-written: + optimizable, flexible; − error-prone, not maintainable.'},
   {t:'multi',q:'Why keep the lexical analyzer separate from the syntactic analyzer? Select every reason from the lecture.',
    opts:['Modularity / maintainability','Efficiency through task specialization','Reusability — swap the lexer without touching the rest','It removes the need for a symbol table','It guarantees the grammar is unambiguous'],ans:[0,1,2],
    why:'Three reasons: modularity, efficiency, reusability. Separation says nothing about the symbol table or grammar ambiguity.'}
  ]},
{ id:3, name:'Syntactic analysis I', code:'SEC-03 · WEEK 3',
  blurb:'Grammars as quadruples, derivations as proofs, and the grammar surgery that makes predictive parsing possible: precedence, left-recursion removal, factoring, FIRST and FOLLOW.',
  log:['Grammar anatomy','Leftmost derivation builder','Ambiguity & left recursion','Grammar transformations','FIRST / FOLLOW set builder','Recursive-descent prediction'],
  items:[
   {t:'mc',q:'A grammar is a quadruple (T, N, S, R). What makes it context-free?',
    opts:['R is finite','Every production has the form A → β with a single non-terminal A on the left','S is unique','T and N are disjoint'],ans:1,
    why:'General productions are α → β with α, β ∈ (T ∪ N)*. Context-free grammars restrict the left side to one non-terminal: A → β, A ∈ N.'},
   {t:'sort',q:'Using the sentence grammar (`<sentence> ::= <noun phrase><verb phrase>` …), classify each string.',bins:['sentential form','sentence','neither'],
    items:[['the dog <verb> the bone','sentential form'],['the dog gnawed the bone','sentence'],['<article><verb><noun phrase>','sentential form'],['gnawed bone the the','sentence'],['the dog gnawed <sentence> bone quickly','neither']],
    why:'A sentential form is any string over (T ∪ N)*; a sentence is a string of terminals only — even a meaningless one like “gnawed bone the the”. A string containing a symbol outside the grammar (`quickly`) is neither.'},
   {t:'derive',q:'Build the leftmost derivation of `id + id ∗ id`. At each step, choose the production for the leftmost non-terminal (underlined).',grammar:G1,
    rules:{E:['E + T','E − T','T'],T:['T ∗ F','T / F','F'],F:['( E )','id']},
    start:'E',target:'id + id ∗ id',
    why:'E ⇒ E+T ⇒ T+T ⇒ F+T ⇒ id+T ⇒ id+T∗F ⇒ id+F∗F ⇒ id+id∗F ⇒ id+id∗id. Because the grammar encodes precedence (T binds ∗ tighter than E binds +), this derivation is unique — no ambiguity.'},
   {t:'mc',q:'Top-down parsers build one kind of derivation; bottom-up parsers build the other. Which pairing is right?',
    opts:['Top-down: rightmost · Bottom-up: leftmost','Top-down: leftmost · Bottom-up: rightmost (in reverse)','Both build leftmost derivations','Both build rightmost derivations'],ans:1,
    why:'A top-down parser expands from the root, always the leftmost non-terminal first. A bottom-up parser reduces from the leaves, producing a rightmost derivation in reverse.'},
   {t:'mc',q:'With `E → E + E | E ∗ E | id`, the string `id + id ∗ id` has two parse trees. Which fix does the lecture call the superior solution?',
    opts:['Encode operator precedence inside the parser','Add backtracking','Transform the grammar to remove the ambiguity','Let the lexer resolve it'],ans:2,
    why:'Transforming the grammar (e.g. introducing E, T, F levels for precedence) is superior. Precedence inside the parser complicates it and is rarely done; backtracking is inefficient.'},
   {t:'mc',q:'Why is `E → E + T` fatal for a predictive parser?',
    opts:['It makes the grammar ambiguous','The parser would apply E → E + T forever without consuming input','It produces a rightmost derivation','It requires a symbol table'],ans:1,
    why:'Left recursion: a predictive parser applies the first applicable rule, so A → Aα recurses infinitely without ever matching a token. It must be rewritten as right recursion.'},
   {t:'mc',q:'Remove the immediate left recursion from `E → E + T | E − T | T`. Which result is correct?',
    opts:['`E → T E′`  ·  `E′ → ε | + T E′ | − T E′`','`E → E′ T`  ·  `E′ → ε | E′ + | E′ −`','`E → T | T + E | T − E`','`E → T E′`  ·  `E′ → + T | − T`'],ans:0,
    why:'Isolate A → Aα₁ | Aα₂ (α = +T, −T) and A → β (β = T). Then A → βA′ and A′ → ε | α₁A′ | α₂A′. Option D forgets ε and the recursion on E′; option C is still ambiguous/unfactored.'},
   {t:'mc',q:'`A → aB | aC | b` forces a choice between right-hand sides that start with the same symbol. Apply left factoring.',
    opts:['`A → aD | b`  ·  `D → B | C`','`A → a | b`  ·  `D → aB | aC`','`A → D a | b`  ·  `D → B | C`','`A → aBC | b`'],ans:0,
    why:'Factorization: A → αA′ with A′ → β₁ | β₂. Here α = a, so A → aD | b and D → B | C. The parser now needs only one lookahead to pick a rule.'},
   {t:'mc',q:'Convert the EBNF repetition `A → α { X } β` into plain BNF.',
    opts:['`A → α N β`  ·  `N → X N | ε`','`A → α N β`  ·  `N → X | ε`','`A → α X β | α β`','`A → α N β`  ·  `N → N X`'],ans:0,
    why:'Repetition introduces a new non-terminal N with N → X N (right recursion) and N → ε. Option B is the transformation for optionality [X], not repetition.'},
   {t:'setbuild',q:'Compute FIRST(T′) for the grammar below. Toggle the symbols that belong in the set.',grammar:G2,
    palette:['0','1','(',')','+','∗','$','ε'],ans:['∗','ε'],
    why:'T′ → ∗ F T′ | ε. The first right-hand side starts with the terminal ∗; the second is an ε-production, so ε is in FIRST(T′).'},
   {t:'setbuild',q:'Compute FOLLOW(E′).',grammar:G2,
    palette:['0','1','(',')','+','∗','$','ε'],ans:['$',')'],
    why:'E′ appears at the end of E → T E′ and E′ → + T E′, so FOLLOW(E′) ⊇ FOLLOW(E). E is the start symbol (so $) and appears in F → ( E ), giving ). FOLLOW(E′) = {$, )}. ε is never in a FOLLOW set.'},
   {t:'setbuild',q:'Compute FOLLOW(F).',grammar:G2,
    palette:['0','1','(',')','+','∗','$','ε'],ans:['∗','+','$',')'],
    why:'F is followed by T′ in T → F T′ and T′ → ∗ F T′. FIRST(T′) = {∗, ε}: add ∗, and since T′ can vanish, add FOLLOW(T′) = {+, $, )}. FOLLOW(F) = {∗, +, $, )}.'},
   {t:'trace',q:'Predict the recursive-descent parser. The parser is inside `E′()`; decide what it does for each lookahead.',code:G2+'\n\n'+G2FF,
    steps:[
     {p:'lookahead = `+`',opts:['Apply E′ → + T E′','Apply E′ → ε','Error'],ans:0,why:'+ ∈ FIRST(+TE′), so match(+), call T(), call E′().'},
     {p:'lookahead = `)`',opts:['Apply E′ → + T E′','Apply E′ → ε','Error'],ans:1,why:') ∈ FOLLOW(E′) = {$, )}, so the ε-production is chosen.'},
     {p:'lookahead = `∗`',opts:['Apply E′ → + T E′','Apply E′ → ε','Error'],ans:2,why:'∗ is neither in FIRST(+TE′) nor in FOLLOW(E′). The parser sets error = true.'},
     {p:'Now inside `F()` with lookahead = `(`',opts:['match(( ); E(); match( ))','Apply F → 0','Error'],ans:0,why:'( ∈ FIRST((E)). F matches (, calls E, then matches ).'}
    ],why:'Each non-terminal is a function. FIRST sets pick a right-hand side; when ε is in FIRST, FOLLOW decides whether to choose it. No backtracking, ever.'},
   {t:'sort',q:'Recursive-descent or table-driven? Sort the characteristics.',bins:['Recursive descent','Table-driven'],
    items:[['Easy to trace and debug','Recursive descent'],['Only the table changes when the language changes','Table-driven'],['Hard-coded, so unusual situations can be handled','Recursive descent'],['Building the table manually is hard and error-prone','Table-driven'],['A grammar change means a code change','Recursive descent'],['The parsing algorithm is universal','Table-driven']],
    why:'Recursive descent: one function per non-terminal; easy to implement and debug, hard to maintain. Table-driven: universal algorithm plus a parsing table; easier to maintain, harder to trace, tables best generated by tools.'},
   {t:'mc',q:'Parsing `bcde` with `S → ee | bAc | bAe`, `A → d | cA`, the parser tries S → bAc, fails at the last token, and retries with S → bAe. What is this method called, and what does the lecture say about it?',
    opts:['Predictive parsing — the standard technique','Backtracking — brute force, seldom used, most time spent on undone moves','Bottom-up parsing — efficient and common','Syntax-directed translation — folds phases into one pass'],ans:1,
    why:'Backtracking explores alternatives one after another and undoes them on failure. It is tricky, inefficient and seldom used; the simple fix is removing the ambiguity from the grammar.'}
  ]}
];

/* ---------- game state ---------- */
const S={sector:0,idx:0,score:0,streak:0,hull:3,secScore:0,secRight:0,secTotal:0,mode:'run',total:0,right:0,attempts:0};
const ui={sector:$('#s-sector'),score:$('#s-score'),streak:$('#s-streak'),hull:$('#s-hull')};
function hud(){ui.sector.textContent=S.sector?String(S.sector).padStart(2,'0'):'—';ui.score.textContent=S.score;ui.streak.textContent='×'+mult();[...ui.hull.children].forEach((i,k)=>i.classList.toggle('off',k>=S.hull));}
const mult=()=>S.streak>=6?3:S.streak>=3?2:1;
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));$('#'+id).classList.add('on');window.scrollTo({top:0});}

function renderIndex(){
  const best=store.get('best',{});
  $('#sector-index').innerHTML=SECTORS.map(s=>`<div class="sector"><div class="n">${s.code}</div><h3>${esc(s.name)}</h3><p>${s.items.length} challenges</p><div class="best">${best[s.id]?'best '+best[s.id]+' pts':'not yet cleared'}</div></div>`).join('');
}
function startRun(sectorIdx,mode){
  S.mode=mode;S.sector=sectorIdx+1;S.idx=0;S.hull=3;S.streak=0;S.secScore=0;S.secRight=0;S.secTotal=0;
  if(sectorIdx===0||mode==='free'){S.score=0;S.total=0;S.right=0;}
  const sec=SECTORS[sectorIdx];
  $('#intro-eyebrow').textContent=sec.code;$('#intro-title').textContent=sec.name;$('#intro-blurb').textContent=sec.blurb;
  $('#intro-log').innerHTML=sec.log.map(l=>`<li>${esc(l)}</li>`).join('');
  hud();show('scr-intro');
}
function enter(){S.idx=0;S.hull=3;S.streak=0;S.secScore=0;S.secRight=0;S.secTotal=0;hud();show('scr-play');renderItem();}

function renderItem(){
  const sec=SECTORS[S.sector-1],item=sec.items[S.idx];
  $('#prog').style.width=(S.idx/sec.items.length*100)+'%';
  const card=$('#card');card.innerHTML='';
  const meta=document.createElement('div');meta.className='meta';meta.innerHTML=`<span>${sec.code} · ${String(S.idx+1).padStart(2,'0')}/${String(sec.items.length).padStart(2,'0')}</span><span>${{mc:'select one',multi:'select all',order:'sequence',sort:'classify',trace:'trace',derive:'derivation',setbuild:'set builder'}[item.t]}</span>`;
  card.appendChild(meta);
  const q=document.createElement('p');q.className='q';q.innerHTML=md(item.q);card.appendChild(q);
  if(item.code||item.grammar){const pre=document.createElement('pre');pre.className='code';pre.innerHTML=hl(item.code||item.grammar);card.appendChild(pre);}
  const body=document.createElement('div');card.appendChild(body);
  const why=document.createElement('div');why.className='why';card.appendChild(why);
  const actions=document.createElement('div');actions.className='actions';card.appendChild(actions);
  KIND[item.t](item,body,actions,why);
}
function hl(s){return esc(s).replace(/\b([A-Z])(′?)\b/g,'<span class="nt">$1$2</span>').replace(/\b(if|then|else|final)\b/g,'<span class="k">$1</span>');}

/* result handling — one call per challenge */
function resolve(ok,item,why,actions,detail){
  S.attempts++;S.secTotal++;S.total++;
  if(ok){S.streak++;const pts=10*mult();S.score+=pts;S.secScore+=pts;S.secRight++;S.right++;
    why.className='why show ok';why.innerHTML=`<b>Confirmed · +${pts}</b>${md(detail||item.why)}`;}
  else{S.streak=0;S.hull--;$('#card').classList.remove('flash');void $('#card').offsetWidth;$('#card').classList.add('flash');
    why.className='why show no';why.innerHTML=`<b>Hull breach · −1</b>${md(detail||item.why)}`;}
  hud();
  actions.innerHTML='';
  const b=document.createElement('button');b.className='btn';
  if(S.hull<=0){b.textContent='Restart sector';b.onclick=enter;why.innerHTML+=`<p class="breach">Hull integrity zero. The sector restarts from its first challenge.</p>`;}
  else{b.textContent=S.idx+1<SECTORS[S.sector-1].items.length?'Next':'Sector report';b.onclick=next;}
  actions.appendChild(b);b.focus();
}
function next(){S.idx++;const sec=SECTORS[S.sector-1];if(S.idx<sec.items.length)renderItem();else sectorDone();}
function sectorDone(){
  const sec=SECTORS[S.sector-1];const best=store.get('best',{});if(!best[sec.id]||S.secScore>best[sec.id]){best[sec.id]=S.secScore;store.set('best',best);}
  $('#done-title').textContent=sec.name;$('#done-score').textContent=S.secScore;$('#done-acc').textContent=Math.round(S.secRight/S.secTotal*100)+'%';$('#done-hull').textContent=S.hull;
  $('#done-log').innerHTML=sec.log.map(l=>`<li>${esc(l)} — cleared</li>`).join('');
  const last=S.sector>=SECTORS.length||S.mode==='free';
  $('#btn-next').textContent=last?(S.mode==='free'?'Title':'Final report'):'Next sector';
  $('#prog').style.width='100%';show('scr-done');
}
function afterSector(){
  if(S.mode==='free'){renderIndex();show('scr-title');return;}
  if(S.sector<SECTORS.length){startRun(S.sector,'run');return;}
  const acc=Math.round(S.right/S.total*100);const best=Math.max(store.get('bestRun',0),S.score);store.set('bestRun',best);
  const rank=acc>=95?'Optimizing compiler':acc>=85?'Predictive parser':acc>=70?'Table-driven scanner':acc>=50?'Hand-written lexer':'Assembler';
  $('#final-rank').textContent=rank;$('#final-score').textContent=S.score;$('#final-acc').textContent=acc+'%';$('#final-best').textContent=best;
  $('#final-blurb').textContent={'Optimizing compiler':'Front end and back end both clean. Nothing left to eliminate.','Predictive parser':'One token of lookahead was enough almost every time.','Table-driven scanner':'Solid and general. A few table entries still need checking.','Hand-written lexer':'Gets the job done, but error-prone in places — re-run the sectors you lost hull in.','Assembler':'One-to-one translation only. Time to go back through the slides.'}[rank];
  renderIndex();show('scr-final');
}

/* ---------- challenge kinds ---------- */
const KIND={};
KIND.mc=(item,body,actions,why)=>{
  const wrap=document.createElement('div');wrap.className='opts';body.appendChild(wrap);
  const order=shuffle(item.opts.map((_,i)=>i));
  order.forEach((oi,k)=>{const b=document.createElement('button');b.className='opt';b.innerHTML=`<span class="key">${String.fromCharCode(65+k)}</span><span>${md(item.opts[oi])}</span>`;
    b.onclick=()=>{[...wrap.children].forEach((c,j)=>{c.disabled=true;if(order[j]===item.ans)c.classList.add('right');});if(oi!==item.ans)b.classList.add('wrong');resolve(oi===item.ans,item,why,actions);};
    wrap.appendChild(b);});
};
KIND.multi=(item,body,actions,why)=>{
  const wrap=document.createElement('div');wrap.className='opts';body.appendChild(wrap);
  const order=shuffle(item.opts.map((_,i)=>i));const sel=new Set();
  order.forEach((oi,k)=>{const b=document.createElement('button');b.className='opt';b.innerHTML=`<span class="key">${String.fromCharCode(65+k)}</span><span>${md(item.opts[oi])}</span>`;
    b.onclick=()=>{if(sel.has(oi))sel.delete(oi);else sel.add(oi);b.classList.toggle('sel',sel.has(oi));};wrap.appendChild(b);});
  const go=document.createElement('button');go.className='btn';go.textContent='Confirm selection';
  go.onclick=()=>{[...wrap.children].forEach((c,j)=>{c.disabled=true;const oi=order[j];if(item.ans.includes(oi))c.classList.add('right');else if(sel.has(oi))c.classList.add('wrong');});resolve(sameSet([...sel],item.ans),item,why,actions);};
  actions.appendChild(go);
};
KIND.order=(item,body,actions,why)=>{
  const slot=document.createElement('div');slot.className='slot';const pool=document.createElement('div');pool.className='chips';body.append(slot,pool);
  const chosen=[];const chips=shuffle(item.items).map(t=>{const c=document.createElement('button');c.className='chip';c.textContent=t;c.onclick=()=>{if(c.classList.contains('used'))return;chosen.push(t);c.classList.add('used');draw();};pool.appendChild(c);return c;});
  function draw(){slot.innerHTML='';if(!chosen.length){slot.innerHTML='<span class="empty">tap phases in order</span>';}chosen.forEach((t,i)=>{const c=document.createElement('button');c.className='chip';c.dataset.i=(i+1)+'.';c.textContent=t;c.title='remove';c.onclick=()=>{chosen.splice(i,1);chips.find(x=>x.textContent===t).classList.remove('used');draw();};slot.appendChild(c);});go.disabled=chosen.length!==item.items.length;}
  const go=document.createElement('button');go.className='btn';go.textContent='Lock sequence';go.disabled=true;
  go.onclick=()=>{let ok=true;[...slot.children].forEach((c,i)=>{const r=chosen[i]===item.items[i];c.classList.add(r?'right':'wrong');c.onclick=null;if(!r)ok=false;});chips.forEach(c=>c.onclick=null);
    resolve(ok,item,why,actions,ok?null:item.why+' Correct order: '+item.items.join(' → ')+'.');};
  actions.appendChild(go);draw();
};
KIND.sort=(item,body,actions,why)=>{
  const rows=document.createElement('div');rows.className='rows';body.appendChild(rows);
  const picks=new Array(item.items.length).fill(null);
  item.items.forEach(([lx],i)=>{const r=document.createElement('div');r.className='row';const l=document.createElement('div');l.className='lx';l.textContent=lx;const bins=document.createElement('div');bins.className='bins';
    item.bins.forEach(b=>{const c=document.createElement('button');c.className='chip';c.textContent=b;c.onclick=()=>{picks[i]=b;[...bins.children].forEach(x=>x.classList.toggle('sel',x.textContent===b));go.disabled=picks.some(p=>p===null);};bins.appendChild(c);});
    r.append(l,bins);rows.appendChild(r);});
  const go=document.createElement('button');go.className='btn';go.textContent='Confirm';go.disabled=true;
  go.onclick=()=>{let wrong=0;[...rows.children].forEach((r,i)=>{const want=item.items[i][1];[...r.querySelector('.bins').children].forEach(c=>{c.onclick=null;if(c.textContent===want)c.classList.add('right');else if(c.classList.contains('sel'))c.classList.add('wrong');});if(picks[i]!==want)wrong++;});
    resolve(wrong===0,item,why,actions,wrong?`${wrong} misclassified. `+item.why:null);};
  actions.appendChild(go);
};
KIND.setbuild=(item,body,actions,why)=>{
  const chips=document.createElement('div');chips.className='chips';body.appendChild(chips);const sel=new Set();
  item.palette.forEach(s=>{const c=document.createElement('button');c.className='chip';c.textContent=s;c.onclick=()=>{sel.has(s)?sel.delete(s):sel.add(s);c.classList.toggle('sel',sel.has(s));};chips.appendChild(c);});
  const go=document.createElement('button');go.className='btn';go.textContent='Confirm set';
  go.onclick=()=>{[...chips.children].forEach(c=>{c.onclick=null;if(item.ans.includes(c.textContent))c.classList.add('right');else if(sel.has(c.textContent))c.classList.add('wrong');});
    resolve(sameSet([...sel],item.ans),item,why,actions,sameSet([...sel],item.ans)?null:'Expected {'+item.ans.join(', ')+'}. '+item.why);};
  actions.appendChild(go);
};
KIND.trace=(item,body,actions,why)=>{
  const list=document.createElement('ol');list.className='trace';const opts=document.createElement('div');opts.className='opts';body.append(list,opts);
  let k=0,ok=true;
  function step(){const st=item.steps[k];const li=document.createElement('li');li.className='now';li.innerHTML=`<span class="lbl">step ${k+1}</span>${md(st.p)}`;list.appendChild(li);opts.innerHTML='';
    st.opts.forEach((o,i)=>{const b=document.createElement('button');b.className='opt';b.innerHTML=`<span class="key">${String.fromCharCode(65+i)}</span><span>${md(o)}</span>`;
      b.onclick=()=>{[...opts.children].forEach((c,j)=>{c.disabled=true;if(j===st.ans)c.classList.add('right');});if(i!==st.ans){b.classList.add('wrong');ok=false;li.innerHTML+=` <span class="no-t">✗ ${md(st.why)}</span>`;}else li.innerHTML+=` <span class="ok-t">✓ ${md(st.opts[st.ans])}</span>`;li.classList.remove('now');
        k++;if(k<item.steps.length)setTimeout(step,i===st.ans?350:900);else resolve(ok,item,why,actions,ok?null:'Trace completed with errors. '+item.why);};
      opts.appendChild(b);});}
  step();
};
KIND.derive=(item,body,actions,why)=>{
  const list=document.createElement('ol');list.className='trace';const opts=document.createElement('div');opts.className='opts';body.append(list,opts);
  const NT=Object.keys(item.rules);let form=[item.start],ok=true,steps=0;
  const target=item.target.split(' ');
  const line=(f,tag)=>{const li=document.createElement('li');li.className='now';const idx=f.findIndex(s=>NT.includes(s));li.innerHTML=`<span class="lbl">${tag}</span>`+f.map((s,i)=>i===idx?`<span class="cur">${esc(s)}</span>`:esc(s)).join(' ');list.appendChild(li);return li;};
  // Check whether sentential form can still derive target (simple: terminals so far must be a prefix, length bounded)
  function viable(f){const first=f.findIndex(s=>NT.includes(s));const pre=first<0?f:f.slice(0,first);if(pre.length>target.length)return false;for(let i=0;i<pre.length;i++)if(pre[i]!==target[i])return false;if(f.length>target.length+2)return false;return search(f,0);}
  function search(f,d){if(d>12)return false;const first=f.findIndex(s=>NT.includes(s));if(first<0)return f.join(' ')===item.target;const pre=f.slice(0,first);for(let i=0;i<pre.length;i++)if(pre[i]!==target[i])return false;if(f.length>target.length)return false;
    return item.rules[f[first]].some(r=>search([...f.slice(0,first),...r.split(' '),...f.slice(first+1)],d+1));}
  function step(){const idx=form.findIndex(s=>NT.includes(s));if(idx<0){[...list.children].forEach(l=>l.classList.remove('now'));opts.innerHTML='';resolve(ok&&form.join(' ')===item.target,item,why,actions,ok?null:'Derivation went off course. '+item.why);return;}
    [...list.children].forEach(l=>l.classList.remove('now'));const li=line(form,steps?'⇒':item.start);opts.innerHTML='';const A=form[idx];
    item.rules[A].forEach((r,i)=>{const b=document.createElement('button');b.className='opt';b.innerHTML=`<span class="key">${String.fromCharCode(65+i)}</span><span><code>${esc(A)} → ${esc(r)}</code></span>`;
      b.onclick=()=>{const nf=[...form.slice(0,idx),...r.split(' '),...form.slice(idx+1)];const good=viable(nf);[...opts.children].forEach(c=>c.disabled=true);
        if(good){b.classList.add('right');li.innerHTML+=` <span class="ft-t">[${esc(A)} → ${esc(r)}]</span>`;form=nf;steps++;setTimeout(step,300);}
        else{b.classList.add('wrong');ok=false;li.innerHTML+=` <span class="no-t">✗ ${esc(A)} → ${esc(r)} cannot reach the target</span>`;resolve(false,item,why,actions,'Derivation went off course after '+steps+' step(s). '+item.why);}};
      opts.appendChild(b);});}
  step();
};

/* ---------- wiring ---------- */
$('#btn-start').onclick=()=>startRun(0,'run');
$('#btn-free').onclick=()=>{const idx=$('#sector-index');idx.querySelectorAll('.sector').forEach((el,i)=>{el.classList.add('pick');el.onclick=()=>startRun(i,'free');el.querySelector('.best').textContent='tap to enter';});$('#btn-free').textContent='Choose above';};
$('#btn-enter').onclick=enter;
$('#btn-back-title').onclick=()=>{renderIndex();show('scr-title');};
$('#btn-next').onclick=afterSector;
$('#btn-done-title').onclick=()=>{renderIndex();show('scr-title');};
$('#btn-again').onclick=()=>startRun(0,'run');
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key.toUpperCase();if(k.length===1&&k>='A'&&k<='H'){const o=[...document.querySelectorAll('#scr-play.on .opt:not([disabled])')];const b=o.find(x=>x.querySelector('.key')&&x.querySelector('.key').textContent===k);if(b)b.click();}
  else if(e.key==='Enter'){const b=document.querySelector('.screen.on .actions .btn:not([disabled])');if(b&&document.activeElement.tagName!=='BUTTON')b.click();}});
renderIndex();hud();
