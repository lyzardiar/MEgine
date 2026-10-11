//! Bounded newline-delimited TCP transport for project scripts. Socket work never blocks a tick.
use std::{io::{Read, Write}, net::{SocketAddr, TcpStream}, sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc::{self, Receiver, SyncSender}}, thread::{self, JoinHandle}, time::Duration};
use serde_json::{json, Value};

const MAX_LINE: usize = 524_288;
const QUEUE: usize = 128;

#[derive(Default)]
pub struct ScriptNetwork {
    sender: Option<SyncSender<Vec<u8>>>,
    receiver: Option<Receiver<Value>>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl ScriptNetwork {
    pub fn connect(&mut self, address: &str) -> bool {
        // Literal addresses avoid unbounded DNS work and make the destination explicit.
        let Ok(address) = address.replace("localhost:", "127.0.0.1:").parse::<SocketAddr>() else { return false; };
        if self.worker.as_ref().is_some_and(|worker| !worker.is_finished()) { return false; }
        let (send, outgoing) = mpsc::sync_channel::<Vec<u8>>(QUEUE);
        let (incoming, receive) = mpsc::sync_channel(QUEUE);
        self.stop = Arc::new(AtomicBool::new(false));
        let stop = self.stop.clone();
        self.worker = Some(thread::spawn(move || {
            let result = run(address, &outgoing, &incoming, &stop);
            if !stop.load(Ordering::Relaxed) {
                let _ = incoming.try_send(json!({"type":"closed", "error":result.err().map(|e| e.to_string())}));
            }
        }));
        self.sender = Some(send); self.receiver = Some(receive);
        true
    }

    pub fn send(&self, message: &str) -> bool {
        if message.len() > MAX_LINE || message.contains(['\r', '\n']) || serde_json::from_str::<Value>(message).is_err() { return false; }
        let mut bytes = message.as_bytes().to_vec(); bytes.push(b'\n');
        self.sender.as_ref().is_some_and(|sender| sender.try_send(bytes).is_ok())
    }

    pub fn poll(&mut self) -> String {
        let mut events: Vec<Value> = self.receiver.as_ref().map(|receiver| receiver.try_iter().take(QUEUE).collect()).unwrap_or_default();
        if events.iter().any(|event| event["type"] == "closed") { self.sender = None; }
        // A saturated event queue can reject the worker's final error. Surface termination anyway.
        if self.worker.as_ref().is_some_and(|worker| worker.is_finished()) && self.sender.take().is_some() {
            events.push(json!({"type":"closed", "error":"network worker stopped"}));
        }
        serde_json::to_string(&events).unwrap()
    }

    pub fn close(&mut self) { self.stop.store(true, Ordering::Relaxed); self.sender = None; self.receiver = None; }
}

impl Drop for ScriptNetwork { fn drop(&mut self) { self.close(); } }

fn run(address: SocketAddr, outgoing: &Receiver<Vec<u8>>, incoming: &SyncSender<Value>, stop: &AtomicBool) -> std::io::Result<()> {
    let mut socket = TcpStream::connect_timeout(&address, Duration::from_secs(3))?;
    socket.set_nodelay(true)?; socket.set_nonblocking(true)?;
    let emit = |event| incoming.try_send(event).map_err(|_| std::io::Error::other("network event queue is full"));
    emit(json!({"type":"connected"}))?;
    let mut pending = Vec::new(); let mut written = 0; let mut input = Vec::new(); let mut buffer = [0_u8; 8192];
    while !stop.load(Ordering::Relaxed) {
        if written == pending.len() { pending = outgoing.try_recv().unwrap_or_default(); written = 0; }
        if written < pending.len() {
            match socket.write(&pending[written..]) {
                Ok(0) => return Err(std::io::ErrorKind::WriteZero.into()),
                Ok(count) => written += count,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {},
                Err(error) => return Err(error),
            }
        }
        match socket.read(&mut buffer) {
            Ok(0) => return Ok(()),
            Ok(count) => {
                input.extend_from_slice(&buffer[..count]);
                while let Some(end) = input.iter().position(|&b| b == b'\n') {
                    if end > MAX_LINE { return Err(std::io::Error::other("network message exceeds 512 KiB")); }
                    let value: Value = serde_json::from_slice(&input[..end]).map_err(std::io::Error::other)?;
                    emit(json!({"type":"message", "data":value}))?;
                    input.drain(..=end);
                }
                if input.len() > MAX_LINE { return Err(std::io::Error::other("network message exceeds 512 KiB")); }
            },
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {},
            Err(error) => return Err(error),
        }
        thread::sleep(Duration::from_millis(2));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, time::Instant};

    #[test]
    fn exchanges_fragmented_messages_and_reports_disconnect() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut peer, _) = listener.accept().unwrap();
            peer.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut input = [0; 64]; let count = peer.read(&mut input).unwrap();
            assert_eq!(&input[..count], b"{\"ping\":1}\n");
            peer.write_all(b"{\"frame\":").unwrap();
            thread::sleep(Duration::from_millis(10));
            peer.write_all(b"42}\n{\"frame\":43}\n").unwrap();
        });
        let mut client = ScriptNetwork::default();
        assert!(!client.connect("invalid")); assert!(client.connect(&address.to_string()));
        assert!(!client.connect(&address.to_string()));
        assert!(!client.send("\n{}")); assert!(!client.send(&"x".repeat(MAX_LINE + 1)));
        assert!(client.send("{\"ping\":1}"));
        let deadline = Instant::now() + Duration::from_secs(4); let mut events = Vec::new();
        while Instant::now() < deadline {
            events.extend(serde_json::from_str::<Vec<Value>>(&client.poll()).unwrap());
            if events.iter().any(|event| event["type"] == "closed") { break; }
            thread::sleep(Duration::from_millis(5));
        }
        server.join().unwrap();
        assert_eq!(events.iter().filter(|event| event["type"] == "message").count(), 2);
        assert_eq!(events[1]["data"]["frame"], 42);
        assert_eq!(events.last().unwrap()["type"], "closed");
    }

    #[test]
    fn exchanges_large_unicode_maps_and_rejects_oversized_frames() {
        use std::io::{BufRead, BufReader};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let payload = json!({"map": "雪".repeat(50_000)}).to_string();
        assert!(payload.len() > 65_536 && payload.len() < MAX_LINE);
        let expected = payload.clone();
        let server = thread::spawn(move || {
            let (mut peer, _) = listener.accept().unwrap();
            peer.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut line = String::new();
            BufReader::new(peer.try_clone().unwrap()).read_line(&mut line).unwrap();
            assert_eq!(line.trim_end(), expected);
            for chunk in line.as_bytes().chunks(4096) { peer.write_all(chunk).unwrap(); }
            let _ = peer.write_all(&vec![b'x'; MAX_LINE + 1]);
        });
        let mut client = ScriptNetwork::default();
        assert!(client.connect(&address.to_string()));
        assert!(!client.send(&json!({"map": "x".repeat(MAX_LINE)}).to_string()));
        assert!(client.send(&payload));
        let deadline = Instant::now() + Duration::from_secs(4);
        let mut events = Vec::new();
        while Instant::now() < deadline {
            events.extend(serde_json::from_str::<Vec<Value>>(&client.poll()).unwrap());
            if events.iter().any(|event| event["type"] == "closed") { break; }
            thread::sleep(Duration::from_millis(5));
        }
        server.join().unwrap();
        assert_eq!(events.iter().find(|event| event["type"] == "message").unwrap()["data"], serde_json::from_str::<Value>(&payload).unwrap());
        assert!(events.iter().any(|event| event["type"] == "closed" && event["error"].as_str().is_some_and(|text| text.contains("512 KiB"))));
    }

}
