// Author: MiYu. Exercise V8 memory limits in child processes so a VM abort is a test failure.
#![cfg(feature = "v8-runtime")]
use mengine_script::ScriptHost;
use std::{process::{Command, Stdio}, time::{Duration, Instant}};

#[test]
fn memory_limit_child() {
    let Ok(case) = std::env::var("MENGINE_VM_LIMIT_CASE") else { return; };
    let mut host = ScriptHost::new().unwrap();
    let source = match case.as_str() {
        "objects" => "var pressure=[];for(let i=0;i<1000;i++)pressure.push(new Array(100000).fill(i))",
        "buffers" => "var pressure=[];for(let i=0;i<9;i++)pressure.push(new ArrayBuffer(32*1024*1024))",
        "oversized-buffer" => "new ArrayBuffer(1024*1024*1024)",
        "large-array" => "new Array(48000000).fill(0)",
        _ => panic!("unknown case"),
    };
    let error=host.eval(source).expect_err("allocation limit must reject workload").to_string();
    if case=="objects" || case=="large-array" || error.contains("heap limit") {
        assert!(error.contains("heap limit"),"{error}");
        assert!(host.eval("1+1").unwrap_err().to_string().contains("heap limit"));
    } else {
        assert!(error.contains("Array buffer allocation failed") || error.contains("ArrayBuffer"),"{error}");
        host.eval("1+1").unwrap();
    }
    drop(host);
    ScriptHost::new().unwrap().eval("if(2+2!==4)throw Error('new host')").unwrap();
}

#[test]
fn memory_limit_failures_remain_contained_and_hosts_can_be_recreated() {
    for case in ["objects","buffers","oversized-buffer","large-array"] {
        let mut child=Command::new(std::env::current_exe().unwrap()).args(["--exact","memory_limit_child","--nocapture"]).env("MENGINE_VM_LIMIT_CASE",case).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
        let deadline=Instant::now()+Duration::from_secs(20);
        loop {
            if child.try_wait().unwrap().is_some() { break; }
            if Instant::now()>=deadline { child.kill().unwrap();let output=child.wait_with_output().unwrap();panic!("{case} timed out: {}",String::from_utf8_lossy(&output.stderr)); }
            std::thread::sleep(Duration::from_millis(20));
        }
        let output=child.wait_with_output().unwrap();
        assert!(output.status.success(),"{case}: {}\n{}",String::from_utf8_lossy(&output.stdout),String::from_utf8_lossy(&output.stderr));
    }
}
