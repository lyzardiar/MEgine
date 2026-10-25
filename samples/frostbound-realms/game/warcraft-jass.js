// Author: MiYu. Bounded JASS execution with explicit native bindings and no JavaScript evaluation.
var FrostWarcraftJass=(()=>{
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),precedence={or:1,and:2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6};
  function parse(source){
    if(typeof source!=='string'||source.length>8*1024*1024)throw Error('Invalid JASS source');
    const tokens=[];let offset=source.charCodeAt(0)===0xfeff?1:0,line=1;
    const lex=/\s+|\/\/[^\r\n]*|"(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*'|0[xX][0-9a-fA-F]+|\$[0-9a-fA-F]+|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|==|!=|<=|>=|[()+\-*/<>=,\[\]]/y;
    while(offset<source.length){lex.lastIndex=offset;const match=lex.exec(source);if(!match)throw Error('Unsupported JASS token at line '+line);const text=match[0];if(!/^\s|^\/\//.test(text))tokens.push({text,line});if(tokens.length>250000)throw Error('JASS token limit exceeded');line+=(text.match(/\n/g)||[]).length;offset=lex.lastIndex;}
    tokens.push({text:'<end>',line});let at=0,depth=0;
    const peek=()=>tokens[at].text,fail=message=>{throw Error(message+' at JASS line '+tokens[at].line);};
    function take(wanted){const token=tokens[at];if(wanted!==undefined&&token.text!==wanted)fail('Expected '+wanted+', got '+token.text);if(token.text==='<end>')fail('Unexpected end');at++;return token.text;}
    function identifier(){const value=take();if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value))fail('Expected identifier');return value;}
    function expression(min=0){
      if(++depth>128)fail('JASS expression nesting limit');let node;const token=take();
      if(token==='('){node=expression();take(')');}
      else if(token==='not'||token==='-'||token==='+')node={op:'unary',operator:token,value:expression(7)};
      else if(token==='function')node={op:'code',name:identifier()};
      else if(token==='true'||token==='false'||token==='null')node={op:'literal',type:token==='null'?'null':'boolean',value:token==='null'?null:token==='true'};
      else if(token.startsWith('"'))node={op:'literal',type:'string',value:JSON.parse(token)};
      else if(token.startsWith("'")){const text=token.slice(1,-1);if(text.length!==4||[...text].some(c=>c.charCodeAt(0)>255))fail('Invalid raw code');node={op:'literal',type:'integer',value:[...text].reduce((n,c)=>(n<<8)|c.charCodeAt(0),0)};}
      else if(/^(?:\d|\.|\$)/.test(token)){const hex=/^(?:0x|\$)/i.test(token),real=!hex&&/[.eE]/.test(token);node={op:'literal',type:real?'real':'integer',value:real?Math.fround(Number(token)):parseInt(token.replace(/^\$/,'0x'),hex?16:10)|0};}
      else if(/^[A-Za-z_]/.test(token)){
        if(peek()==='('){take();const args=[];if(peek()!==')')do{args.push(expression());if(peek()!==',')break;take();}while(true);take(')');node={op:'call',name:token,args};}
        else node={op:'variable',name:token,index:peek()==='['?(take(),indexExpression()):null};
      }else fail('Invalid expression '+token);
      while(own(precedence,peek())&&precedence[peek()]>=min){const operator=take();node={op:'binary',operator,left:node,right:expression(precedence[operator]+1)};}
      depth--;return node;
    }
    function indexExpression(){const value=expression();take(']');return value;}
    function declaration(){const constant=peek()==='constant';if(constant)take();const type=identifier(),array=peek()==='array';if(array)take();const name=identifier(),value=peek()==='='?(take(),expression()):null;return {type,array,name,value,constant};}
    function block(stops){
      if(++depth>128)fail('JASS statement nesting limit');const statements=[];
      while(!stops.includes(peek())){
        const kind=take(),line=tokens[at-1].line;let statement;
        if(kind==='local')statement={op:'local',declaration:declaration()};
        else if(kind==='set'){const name=identifier(),index=peek()==='['?(take(),indexExpression()):null;take('=');statement={op:'set',name,index,value:expression()};}
        else if(kind==='call'){const value=expression();if(value.op!=='call')fail('Expected function call');statement={op:'call',value};}
        else if(kind==='return')statement={op:'return',value:tokens[at].line===line&&!stops.includes(peek())?expression():null};
        else if(kind==='exitwhen')statement={op:'exitwhen',value:expression()};
        else if(kind==='loop'){statement={op:'loop',body:block(['endloop'])};take('endloop');}
        else if(kind==='if'){
          const branches=[];let condition=expression();take('then');branches.push({condition,body:block(['elseif','else','endif'])});
          while(peek()==='elseif'){take();condition=expression();take('then');branches.push({condition,body:block(['elseif','else','endif'])});}
          const otherwise=peek()==='else'?(take(),block(['endif'])):[];take('endif');statement={op:'if',branches,otherwise};
        }else fail('Unsupported statement '+kind);
        statements.push({...statement,line});
      }
      depth--;return statements;
    }
    const functions=Object.create(null),globals=[];
    while(peek()!=='<end>'){
      if(peek()==='globals'){take();while(peek()!=='endglobals')globals.push(declaration());take();continue;}
      take('function');const name=identifier();if(own(functions,name))fail('Duplicate function '+name);take('takes');const parameters=[];
      if(peek()==='nothing')take();else do{parameters.push({type:identifier(),name:identifier()});if(peek()!==',')break;take();}while(true);
      take('returns');const returns=identifier(),body=block(['endfunction']);take('endfunction');functions[name]={parameters,returns,body};
    }
    return {functions,globals,tokenCount:tokens.length-1};
  }
  function link(sources){
    if(!Array.isArray(sources)||sources.length>64||sources.some(source=>typeof source!=='string')||sources.reduce((n,source)=>n+source.length,0)>8*1024*1024)throw Error('Invalid JASS module sources');
    const functions=Object.create(null),globals=[],names=new Set();let tokenCount=0;
    for(const source of sources){
      const program=parse(source);tokenCount+=program.tokenCount;if(tokenCount>250000)throw Error('JASS module token limit exceeded');
      for(const [name,fn] of Object.entries(program.functions)){if(own(functions,name))throw Error('Duplicate JASS module function '+name);functions[name]=fn;}
      for(const declaration of program.globals){if(names.has(declaration.name))throw Error('Duplicate JASS module global '+declaration.name);names.add(declaration.name);globals.push(declaration);}
    }
    return {functions,globals,tokenCount};
  }
  function create(program,{natives={},constants={},handleTypes={},instructionLimit=100000,callLimit=128}={}){
    if(!Number.isSafeInteger(instructionLimit)||instructionLimit<1||!Number.isSafeInteger(callLimit)||callLimit<1)throw Error('Invalid JASS execution limits');
    const globals=Object.create(null),parents=Object.assign(Object.create(null),{agent:'handle',widget:'agent',unit:'widget',item:'widget',destructable:'widget',player:'agent',trigger:'agent',event:'agent',triggeraction:'handle',unitstate:'handle',eventid:'handle',unitevent:'eventid',playercolor:'handle'}),types=new Set(['integer','real','boolean','string','code','nothing','handle',...Object.keys(parents)]);let remaining=instructionLimit,depth=0,expressionDepth=0;
    if(!handleTypes||typeof handleTypes!=='object'||Array.isArray(handleTypes)||Object.keys(handleTypes).length>128)throw Error('Invalid JASS handle types');
    for(const [name,parent] of Object.entries(handleTypes)){
      if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)||typeof parent!=='string'||!/^[A-Za-z_][A-Za-z_0-9]*$/.test(parent)||types.has(name)&&parents[name]!==parent)throw Error('Invalid JASS handle inheritance '+name);
      parents[name]=parent;types.add(name);
    }
    for(const name of Object.keys(parents)){
      const seen=new Set([name]);let current=name;
      while(current!=='handle'){const parent=parents[current];if(!own(parents,parent)&&parent!=='handle')throw Error('Unknown JASS parent type '+parent);if(seen.has(parent))throw Error('Cyclic JASS handle inheritance');seen.add(parent);current=parent;}
    }
    const inherits=(child,parent)=>{while(child!==parent&&own(parents,child))child=parents[child];return child===parent;};
    const value=(type,v)=>({type,value:v}),step=()=>{if(--remaining<0)throw Error('JASS instruction limit exceeded');};
    const checkType=type=>{if(!types.has(type))throw Error('Unsupported JASS type '+type);};
    const defaults=type=>{checkType(type);return value(type,type==='integer'||type==='real'?0:type==='boolean'?false:null);};
    function convert(type,v){
      checkType(type);if(v.type!=='null')checkType(v.type);
      if(type==='nothing'){if(v.type!=='nothing')throw Error('JASS unexpected return value');return v;}
      if(type===v.type)return type==='integer'?value(type,v.value|0):type==='real'?value(type,Math.fround(v.value)):v;
      if(type==='real'&&v.type==='integer')return value(type,Math.fround(v.value));
      if(v.type==='null'&&!['integer','real','boolean'].includes(type))return value(type,null);
      if(own(parents,v.type)&&inherits(v.type,type))return value(type,v.value);
      throw Error('JASS type mismatch: '+v.type+' to '+type);
    }
    const bool=v=>{if(v.type!=='boolean')throw Error('Expected JASS boolean');return v.value;};
    const slot=(locals,name)=>own(locals,name)?locals[name]:own(globals,name)?globals[name]:(()=>{throw Error('Unknown JASS variable '+name);})();
    const arrayIndex=(expr,locals)=>{const v=evaluate(expr,locals);if(v.type!=='integer'||v.value<0||v.value>=8192)throw Error('Invalid JASS array index');return v.value;};
    function evaluate(node,locals){
      if(expressionDepth>=256)throw Error('JASS evaluation nesting limit');expressionDepth++;
      try{return evaluateNode(node,locals);}finally{expressionDepth--;}
    }
    function evaluateNode(node,locals){
      step();if(node.op==='literal')return value(node.type,node.value);
      if(node.op==='code'){if(!own(program.functions,node.name)&&!own(natives,node.name))throw Error('Unknown JASS function '+node.name);return value('code',Object.freeze({functionName:node.name}));}
      if(node.op==='variable'){const entry=slot(locals,node.name);if(entry.array!==!!node.index)throw Error('JASS array access mismatch');return entry.array?entry.values.get(arrayIndex(node.index,locals))||defaults(entry.type):entry.value;}
      if(node.op==='call')return invoke(node.name,node.args.map(arg=>evaluate(arg,locals)));
      const a=evaluate(node.op==='unary'?node.value:node.left,locals),op=node.operator;
      if(node.op==='unary'){if(op==='not')return value('boolean',!bool(a));if(!['integer','real'].includes(a.type))throw Error('Expected JASS number');return convert(a.type,value(a.type,op==='-'?-a.value:a.value));}
      if(op==='and'&&!bool(a))return value('boolean',false);if(op==='or'&&bool(a))return value('boolean',true);
      const b=evaluate(node.right,locals);if(op==='and'||op==='or')return value('boolean',bool(b));
      const numeric=['integer','real'].includes(a.type)&&['integer','real'].includes(b.type),real=numeric&&(a.type==='real'||b.type==='real');
      const x=real?Math.fround(a.value):a.value,y=real?Math.fround(b.value):b.value;
      if(op==='=='||op==='!='){if(!numeric&&a.type!==b.type){if(a.type==='null')convert(b.type,a);else if(b.type==='null')convert(a.type,b);else if(!inherits(a.type,b.type)&&!inherits(b.type,a.type))throw Error('JASS incompatible equality operands');}const equal=x===y;return value('boolean',op==='=='?equal:!equal);}
      if(op==='+'&&a.type==='string'&&b.type==='string'){if((a.value?.length||0)+(b.value?.length||0)>1048576)throw Error('JASS string limit exceeded');return value('string',(a.value||'')+(b.value||''));}
      if(!numeric)throw Error('Expected JASS numeric operands');
      if(['<','<=','>','>='].includes(op))return value('boolean',op==='<'?x<y:op==='<='?x<=y:op==='>'?x>y:x>=y);
      const type=real?'real':'integer';
      if(op==='/'&&y===0)throw Error('JASS division by zero');
      const result=op==='+'?x+y:op==='-'?x-y:op==='*'?(type==='integer'?Math.imul(x,y):x*y):type==='integer'?Math.trunc(x/y):x/y;
      return convert(type,value(type,result));
    }
    function declare(locals,declaration){const {name,type,array=false,constant=false}=declaration;if(own(locals,name))throw Error('Duplicate JASS variable '+name);if(array&&declaration.value)throw Error('JASS array initializer');locals[name]={type,array,constant,values:array?new Map():null,value:declaration.value?convert(type,evaluate(declaration.value,locals)):defaults(type)};}
    function execute(body,locals){
      for(const statement of body){step();let result;const op=statement.op;
        if(op==='local')declare(locals,statement.declaration);
        else if(op==='call')evaluate(statement.value,locals);
        else if(op==='set'){const entry=slot(locals,statement.name);if(entry.constant||entry.array!==!!statement.index)throw Error('Invalid JASS assignment');const index=statement.index?arrayIndex(statement.index,locals):null,v=convert(entry.type,evaluate(statement.value,locals));if(entry.array)entry.values.set(index,v);else entry.value=v;}
        else if(op==='return')return {returned:statement.value?evaluate(statement.value,locals):value('nothing',null)};
        else if(op==='exitwhen'){if(bool(evaluate(statement.value,locals)))return {exit:true};}
        else if(op==='if')result=execute(statement.branches.find(branch=>bool(evaluate(branch.condition,locals)))?.body||statement.otherwise,locals);
        else if(op==='loop')for(;;){step();result=execute(statement.body,locals);if(result?.exit){result=null;break;}if(result?.returned)break;}
        if(result)return result;
      }
      return null;
    }
    function invoke(name,args){
      step();if(depth>=callLimit)throw Error('JASS call depth limit exceeded');depth++;
      try{
        if(own(natives,name)){const native=natives[name];if(args.length!==native.parameters.length)throw Error('JASS native arity: '+name);return convert(native.returns,value(native.returns,native.call(...args.map((v,i)=>convert(native.parameters[i],v).value))));}
        if(!own(program.functions,name))throw Error('Unsupported JASS native '+name);
        const fn=program.functions[name],locals=Object.create(null);if(args.length!==fn.parameters.length)throw Error('JASS function arity: '+name);
        fn.parameters.forEach((p,i)=>{declare(locals,p);locals[p.name].value=convert(p.type,args[i]);});
        const result=execute(fn.body,locals);if(result?.exit)throw Error('JASS exitwhen outside loop');return convert(fn.returns,result?.returned||value('nothing',null));
      }finally{depth--;}
    }
    for(const [name,v] of Object.entries(constants))globals[name]={type:v.type,array:false,constant:true,value:v};
    for(const declaration of program.globals)declare(globals,declaration);
    return {run(name,args=[]){if(depth===0)remaining=instructionLimit;return invoke(name,args);},get instructionsRemaining(){return remaining;}};
  }
  return {parse,link,create};
})();
if(typeof module!=='undefined')module.exports=FrostWarcraftJass;
