// Author: MiYu. Linear-space VFX/EffectURP_V2_3D adapter; world fog is supplied by the scene separately.
struct Uniforms {
    view_projection: mat4x4<f32>, model: mat4x4<f32>, color: vec4<f32>, custom1: vec4<f32>, custom2: vec4<f32>, uv_transform: vec4<f32>, time_features: vec4<f32>, parameters: array<vec4<f32>,128>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(2) @binding(0) var main_sampler: sampler;
@group(2) @binding(1) var mask_sampler: sampler;
@group(2) @binding(2) var noise_sampler: sampler;
@group(2) @binding(3) var dissolve_sampler: sampler;
@group(2) @binding(4) var sub_sampler: sampler;
@group(1) @binding(6) var main_tex: texture_2d<f32>;
@group(1) @binding(7) var mask_tex: texture_2d<f32>;
@group(1) @binding(8) var noise_tex: texture_2d<f32>;
@group(1) @binding(9) var dissolve_tex: texture_2d<f32>;
@group(1) @binding(10) var sub_tex: texture_2d<f32>;
struct VertexInput { @location(0) position: vec3<f32>, @location(1) uv: vec2<f32>, @location(2) color: vec4<f32> };
struct Varying { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) color: vec4<f32>, @location(2) raw_uv: vec2<f32> };
@vertex fn vs_main(v: VertexInput)->Varying {
    var o: Varying; o.position=u.view_projection*u.model*vec4<f32>(v.position,1.0); o.uv=v.uv*u.uv_transform.xy+u.uv_transform.zw; o.raw_uv=v.uv; o.color=v.color*u.color; return o;
}
fn p(index:u32)->f32 { return u.parameters[index].x; }
fn feature(bit:u32)->bool { return (u32(u.time_features.y)&(1u<<bit))!=0u; }
fn cd(index:u32,fallback:f32)->f32 {
    if !feature(0u) { return fallback; }
    let selection=p(75u+index);
    if selection>7.5 {return u.custom2.w;} if selection>6.5 {return u.custom2.z;} if selection>5.5 {return u.custom2.y;} if selection>4.5 {return u.custom2.x;}
    if selection>3.5 {return u.custom1.w;} if selection>2.5 {return u.custom1.z;} if selection>1.5 {return u.custom1.y;} if selection>0.5 {return u.custom1.x;} return fallback;
}
fn mask(c:vec4<f32>,channel:f32)->f32 { let id=i32(channel); if id==1{return c.r;} if id==2{return c.g;} if id==3{return c.b;} if id==4{return 1.0;} return c.a; }
fn rgb(c:vec4<f32>,channel:f32)->vec3<f32> { let id=i32(channel); if id==1{return c.rrr;} if id==2{return c.ggg;} if id==3{return c.bbb;} if id==4{return c.aaa;} return c.rgb; }
fn rotate(uv:vec2<f32>,angle:f32)->vec2<f32> { let a=uv-vec2<f32>(0.5); let s=sin(angle);let c=cos(angle); return vec2<f32>(a.x*c+a.y*s,-a.x*s+a.y*c)+vec2<f32>(0.5); }
fn polar(uv:vec2<f32>)->vec2<f32> { let a=uv-vec2<f32>(0.5)+vec2<f32>(0.000001);return vec2<f32>(length(a)*2.0,(atan2(a.x,a.y)+3.14159265359)/6.28318530718); }
fn st(uv:vec2<f32>,slot:u32)->vec2<f32> {return uv*u.parameters[116u+slot].xy+u.parameters[116u+slot].zw;}
fn sample_uv(uv:vec2<f32>,slot:u32)->vec2<f32> {var value=uv;if u.parameters[100u+slot].x==3.0 {value.x=clamp(abs(value.x),0.0,1.0);}if u.parameters[100u+slot].y==3.0 {value.y=clamp(abs(value.y),0.0,1.0);}return vec2<f32>(value.x,1.0-value.y);}
@fragment fn fs_main(v:Varying)->@location(0) vec4<f32> {
    let time=u.time_features.x%200000.0;
    var main_uv=v.uv;
    if p(4u)>0.5 {main_uv=rotate(main_uv,p(5u)+p(6u)*time);}
    var mask_color=vec4<f32>(1.0);
    if feature(1u) {
        var uv=v.uv;
        if p(13u)>0.5 {uv=rotate(uv,p(14u)+p(15u)*time);}
        if p(16u)>0.5 {uv=polar(uv);}
        uv+=time*vec2<f32>(p(17u),p(18u));
        if feature(0u) {uv+=vec2<f32>(cd(7u,p(19u)),cd(8u,p(20u)));}
        mask_color=textureSampleLevel(mask_tex,mask_sampler,sample_uv(st(uv,1u),1u),0.0);
    }
    var dissolve_uv=v.uv;
    if feature(0u) {dissolve_uv+=vec2<f32>(cd(13u,p(24u)));}
    if p(7u)>0.5 {main_uv=polar(main_uv);}
    main_uv+=time*vec2<f32>(p(8u),p(9u));
    if feature(0u) {main_uv+=vec2<f32>(cd(3u,p(10u)),cd(4u,p(11u)));}
    var noise_channel=0.0;
    var normalize_uv=vec2<f32>(0.0);
    if feature(2u) {
        var uv=v.uv;
        if feature(0u) {uv+=vec2<f32>(cd(13u,p(24u)));}
        if p(25u)>0.5 {uv=polar(uv);}
        uv+=time*u.parameters[126u].xy;
        if feature(0u) {uv+=vec2<f32>(cd(16u,p(26u)),cd(17u,p(27u)));}
        normalize_uv=vec2<f32>(1.0);
        if p(28u)>0.0001 {let radial=v.uv*2.0-vec2<f32>(1.0);normalize_uv=mix(normalize_uv,radial*inverseSqrt(max(dot(radial,radial),0.000001)),p(28u));}
        var noise=textureSampleLevel(noise_tex,noise_sampler,sample_uv(st(uv,2u),2u),0.0);
        if feature(1u) {noise*=mask(mask_color,p(22u));}
        noise=((noise*p(29u)-vec4<f32>(p(29u)))+noise)*cd(10u,p(30u))*0.1;
        noise_channel=mask(noise,p(31u));
        main_uv+=vec2<f32>(noise_channel)*normalize_uv*u.parameters[126u].zw;
        dissolve_uv+=vec2<f32>(noise_channel)*normalize_uv*p(32u)*u.parameters[126u].zw;
    }
    var main_st=st(main_uv,0u);
    if p(12u)>0.0001 {main_st=mix(main_st,clamp(main_st,vec2<f32>(0.0),vec2<f32>(1.0)),p(12u));}
    let main=textureSampleLevel(main_tex,main_sampler,sample_uv(main_st,0u),0.0);
    let main_color=u.parameters[121u];
    var alpha=clamp(mask(main,p(1u))*main_color.a,0.0,1.0);
    alpha=clamp(alpha-cd(1u,p(2u)),0.0,1.0);
    alpha=clamp(1.0-pow(max(1.0-alpha,0.0001),max(cd(2u,p(3u)),0.01)),0.0,1.0);
    var result=vec4<f32>(rgb(main,p(0u))*main_color.rgb,alpha);
    if feature(4u) {
        var uv=v.uv;
        if p(44u)>0.5 {uv=rotate(uv,p(45u)+p(46u)*time);}
        if p(47u)>0.5 {uv=polar(uv);}
        uv+=time*vec2<f32>(p(48u),p(49u));
        if feature(2u) {uv+=vec2<f32>(noise_channel)*normalize_uv*p(52u)*u.parameters[126u].zw;}
        if feature(0u) {uv+=vec2<f32>(cd(5u,p(50u)),cd(6u,p(51u)));}
        let sub=textureSampleLevel(sub_tex,sub_sampler,sample_uv(st(uv,4u),4u),0.0); let sub_alpha=mask(sub,p(53u)); let sub_color=rgb(sub,p(54u))*u.parameters[122u].rgb;
        var c=result.rgb; var a=result.a;
        if feature(1u) {
            let coverage=mask(mask_color,p(23u));
            if p(55u)<0.5 {c=mix(c,sub_color,sub_alpha*coverage);} else if p(55u)<1.5 {c=mix(c,c*sub_color,coverage);} else {c+=sub_color*coverage;a=clamp(a+sub_alpha*u.parameters[122u].a*coverage,0.0,1.0);}
        } else {
            if p(55u)<0.5 {c=mix(c,sub_color,sub_alpha);} else if p(55u)<1.5 {c=mix(c*sub_color,c,p(56u));} else {c+=sub_color;a=clamp(a+sub_alpha*u.parameters[122u].a,0.0,1.0);}
        }
        result=vec4<f32>(c,clamp(a*mix(1.0,sub_alpha*u.parameters[122u].a,p(56u)),0.0,1.0));
    }
    if feature(3u) {
        dissolve_uv=rotate(dissolve_uv,p(33u));
        if p(34u)>0.5 {dissolve_uv=polar(dissolve_uv);}
        dissolve_uv+=time*vec2<f32>(p(35u),p(36u));
        if feature(0u) {dissolve_uv+=vec2<f32>(cd(14u,p(37u)),cd(15u,p(38u)));}
        let amount=(cd(9u,p(39u))+p(40u)*(1.0-v.color.a))*(1.05+p(41u));
        let dissolve=textureSampleLevel(dissolve_tex,dissolve_sampler,sample_uv(st(dissolve_uv,3u),3u),0.0);
        let width=p(42u)+0.0001;let range=width+(1.0-width-p(41u))*mask(dissolve,p(43u))-amount;
        let right=clamp((range+p(41u))/width,0.0,1.0);let left=clamp(range/width,0.0,1.0);
        let edge=clamp(right-left,0.0,1.0)*u.parameters[123u].a; let coverage=left+edge;
        result=vec4<f32>((left*result.rgb+edge*u.parameters[123u].rgb)/max(coverage,0.000001),clamp(coverage*result.a,0.0,1.0));
    }
    if feature(1u) {result.a*=mask(mask_color,p(21u));}
    if p(40u)<0.5 {result*=v.color;}
    let before=result.rgb;let refine=u.parameters[125u];var refined=before*refine.x;
    if refine.w>0.0001 {refined=mix(refined,pow(abs(before),vec3<f32>(max(refine.z,0.01)))*refine.y,refine.w);}
    result=vec4<f32>(refined,result.a)*u.parameters[124u];result.a=clamp(result.a*cd(20u,p(57u)),0.0,1.0);
    return result;
}
