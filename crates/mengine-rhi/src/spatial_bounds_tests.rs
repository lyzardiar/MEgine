// Author: MiYu. Compare interval bounds with eight transformed corners across renderable and extreme inputs.
use super::*;

fn reference(bounds: Aabb, model: Mat4) -> Option<Aabb> {
    if !model.is_finite() { return None; }
    bounds.transformed_corners(model)
}

fn check(bounds: Aabb, model: Mat4) {
    assert_eq!(bounds.transformed(model),reference(bounds,model),"bounds={bounds:?}, model={model:?}");
}

#[test]
fn interval_bounds_preserve_rotations_shear_mirrors_degenerate_and_reversed_boxes() {
    let boxes=[Aabb {min:Vec3::ZERO,max:Vec3::ONE},Aabb {min:Vec3::splat(-1.),max:Vec3::ONE},Aabb {min:Vec3::new(2.,-4.,7.),max:Vec3::new(-3.,1.,5.)},Aabb {min:Vec3::ZERO,max:Vec3::ZERO},Aabb {min:Vec3::splat(-0.),max:Vec3::ZERO}];
    for bounds in boxes {for angle in -30..=30 {
        let rotate=Mat4::from_euler(glam::EulerRot::YXZ,angle as f32*0.03,angle as f32*0.07,angle as f32*0.13);
        for scale in [Vec3::ONE,Vec3::new(-2.,0.3,4.),Vec3::new(0.,0.,-2.)] {
            let shear=Mat4::from_cols(Vec4::new(1.,0.3,-0.1,0.),Vec4::new(-0.7,1.,0.2,0.),Vec4::new(0.4,0.,1.,0.),Vec4::W);
            check(bounds,Mat4::from_translation(Vec3::new(110.,-12.,0.3))*rotate*shear*Mat4::from_scale(scale));
        }
    }}
}

#[test]
fn interval_bounds_match_corner_rejection_for_invalid_overflow_and_cancellation() {
    let bounds=Aabb {min:Vec3::splat(-f32::MAX),max:Vec3::splat(f32::MAX)};
    for scale in [0.,f32::MIN_POSITIVE,f32::from_bits(1),1.,-1.,2.,f32::MAX] {check(bounds,Mat4::from_scale(Vec3::splat(scale)));}
    for value in [f32::NAN,f32::INFINITY,f32::NEG_INFINITY] {
        let mut matrix=Mat4::IDENTITY;matrix.x_axis.x=value;check(bounds,matrix);
        check(Aabb {min:Vec3::splat(value),max:Vec3::ONE},Mat4::IDENTITY);
    }
    for min in [-f32::MAX,-1e30,-1e-30,-f32::MIN_POSITIVE,0.,f32::MIN_POSITIVE,1e-30,1e30,f32::MAX] {
        let bounds=Aabb {min:Vec3::new(min,min,-min),max:Vec3::new(-min,min,min)};
        for value in [-f32::MAX,-1e30,-1.,-1e-30,0.,1e-30,1.,1e30,f32::MAX] {
            check(bounds,Mat4::from_cols(Vec4::new(value,-value,value,0.),Vec4::new(-value,value,value,0.),Vec4::new(value,value,-value,0.),Vec4::new(-value,value,-value,1.)));
        }
    }
}

#[test]
fn interval_bounds_match_deterministic_finite_float_inputs_and_frustum_queries() {
    let mut state=0x81ac_7325u32;
    let mut random=|| {state^=state<<13;state^=state>>17;state^=state<<5;f32::from_bits(state&0xfeff_ffff)};
    let mut expected=Vec::new();let mut actual=Vec::new();
    for _ in 0..100_000 {
        let bounds=Aabb {min:Vec3::new(random(),random(),random()),max:Vec3::new(random(),random(),random())};
        let model=Mat4::from_cols(Vec4::new(random(),random(),random(),0.),Vec4::new(random(),random(),random(),0.),Vec4::new(random(),random(),random(),0.),Vec4::new(random(),random(),random(),1.));
        check(bounds,model);
        if actual.len()<2048 {actual.push(bounds.transformed(model));expected.push(reference(bounds,model));}
    }
    let mut old=SpatialIndex::default();old.update(expected);let mut next=SpatialIndex::default();next.update(actual);
    for offset in [-100.,-1.,0.,1.,100.] {let view=Frustum::from_wgpu_matrix(Mat4::from_translation(Vec3::new(offset,0.,0.)));assert_eq!(next.query(&view),old.query(&view));}
}

#[test]
fn non_affine_bounds_retain_transform_point3_behavior() {
    let bounds=Aabb {min:Vec3::splat(-1.),max:Vec3::ONE};let mut model=Mat4::IDENTITY;model.x_axis.w=0.05;
    let expected=std::panic::catch_unwind(||reference(bounds,model));let actual=std::panic::catch_unwind(||bounds.transformed(model));
    assert_eq!(actual.is_err(),expected.is_err());if let (Ok(actual),Ok(expected))=(actual,expected) {assert_eq!(actual,expected);}
}

#[test]
#[ignore = "manual interval/eight-corner bounds transform CPU comparison"]
fn benchmark_interval_bounds() {
    use std::{hint::black_box,time::Instant};
    for workload in ["axis_aligned","rotation_shear_mirror"] {
        let inputs=(0..10_000).map(|i| {
            let bounds=Aabb {min:Vec3::new(-0.7,-0.2,-1.),max:Vec3::new(0.3,1.7,0.2)};
            let translation=Mat4::from_translation(Vec3::new((i%100) as f32-50.,(i/100) as f32-50.,(i%17) as f32*0.1));
            let model=if workload=="axis_aligned" {translation*Mat4::from_scale(Vec3::new(2.,0.7,1.5))}else {
                let shear=Mat4::from_cols(Vec4::new(-2.,0.3,-0.1,0.),Vec4::new(-0.7,1.,0.2,0.),Vec4::new(0.4,0.,0.1,0.),Vec4::W);
                translation*Mat4::from_euler(glam::EulerRot::YXZ,i as f32*0.001,i as f32*0.03,i as f32*0.007)*shear
            };
            check(bounds,model);(bounds,model)
        }).collect::<Vec<_>>();
        let mut outputs=[vec![None;inputs.len()],vec![None;inputs.len()]];let mut samples=[Vec::new(),Vec::new()];
        for run in 0..11 {for index in if run%2==0 {[0,1]}else {[1,0]} {
            let started=Instant::now();
            for _ in 0..100 {for (out,(bounds,model)) in outputs[index].iter_mut().zip(black_box(&inputs)) {*out=if index==0 {reference(*bounds,*model)}else {bounds.transformed(*model)};}black_box(&outputs[index]);}
            if run>1 {samples[index].push(started.elapsed().as_secs_f64()*1000./100.);}
        }assert_eq!(outputs[0],outputs[1]);}
        for values in &mut samples {values.sort_by(f64::total_cmp);}
        println!("INTERVAL_BOUNDS workload={workload} objects={} samples=9 iterations=100 corners_ms={} interval_ms={}",inputs.len(),samples[0][4],samples[1][4]);
    }
}
