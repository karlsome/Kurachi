"""Safety-focused wrapper for pclistenerNC260902.py.

The original listener remains unchanged. This wrapper imports its Xiao/Windows
automation and Flask app, then replaces the CNC polling and cycle-stop paths.
Set BASE_LISTENER_PATH when the original script is stored elsewhere.
"""

import importlib.util
import os
import socket
import threading
import time

BASE_LISTENER_PATH = os.environ.get(
    "BASE_LISTENER_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "pclistenerNC260902.py"),
)

if not os.path.isfile(BASE_LISTENER_PATH):
    raise FileNotFoundError(
        "Original listener not found. Copy pclistenerNC260902.py beside this file "
        "or set BASE_LISTENER_PATH to its full path. "
        f"Expected: {BASE_LISTENER_PATH}"
    )

spec = importlib.util.spec_from_file_location("base_listener", BASE_LISTENER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load base listener: {BASE_LISTENER_PATH}")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

# Shared state owned by the imported listener.
state_lock = base.state_lock
CNC_IP = base.CNC_IP
CNC_PORT = base.CNC_PORT

POLL_INTERVAL_SECONDS = 1.0
CNC_SOCKET_TIMEOUT_SECONDS = 2.0
OFFLINE_AFTER_CONSECUTIVE_FAILURES = 3

cycle_stop_drag_seen = False
cycle_stop_command_sent = False
cycle_stop_idle_confirmations = 0
cycle_stop_cycle_counted = False
break_drag_seen = False
break_command_sent = False
break_idle_confirmations = 0
break_cycle_counted = False


def create_configured_cnc_sockets():
    status_sock, cmd_sock = base.create_cnc_sockets()
    status_sock.settimeout(CNC_SOCKET_TIMEOUT_SECONDS)
    return status_sock, cmd_sock


def query_cnc_fields(status_sock):
    """Query the CNC while retaining timing and packet-size diagnostics."""
    query_started = time.perf_counter()
    status_sock.sendto(b"que1(7)\x00", (CNC_IP, CNC_PORT))
    response_bytes, _ = status_sock.recvfrom(1024)
    round_trip_ms = (time.perf_counter() - query_started) * 1000

    response_text = response_bytes.decode("ascii", errors="replace").strip("\x00\r\n ")
    if "(" not in response_text or ")" not in response_text:
        raise ValueError(
            f"Malformed CNC response: length={len(response_bytes)}, "
            f"round_trip_ms={round_trip_ms:.1f}"
        )

    inner = response_text[response_text.index("(") + 1:response_text.rindex(")")]
    fields = [int(value.strip()) for value in inner.split(",") if value.strip()]
    if not fields:
        raise ValueError(
            f"Empty CNC response: length={len(response_bytes)}, "
            f"round_trip_ms={round_trip_ms:.1f}"
        )

    return fields, round_trip_ms, len(response_bytes)


def set_state(**updates):
    with state_lock:
        base.gatekeeper_state.update(updates)


def get_stop_flags():
    with state_lock:
        return (
            base.scheduled_cycle_stop,
            base.waiting_drag_after_cycle_stop,
            base.scheduled_break_stop,
            base.waiting_drag_after_break_cut,
        )


def clear_cycle_stop():
    global cycle_stop_drag_seen, cycle_stop_command_sent
    global cycle_stop_idle_confirmations, cycle_stop_cycle_counted
    with state_lock:
        base.scheduled_cycle_stop = False
        base.waiting_drag_after_cycle_stop = False
        base.gatekeeper_state["scheduled_cycle_stop"] = False
        base.gatekeeper_state["cycle_stop_pending"] = False
    cycle_stop_drag_seen = False
    cycle_stop_command_sent = False
    cycle_stop_idle_confirmations = 0
    cycle_stop_cycle_counted = False


def clear_break_stop():
    global break_drag_seen, break_command_sent
    global break_idle_confirmations, break_cycle_counted
    with state_lock:
        base.scheduled_break_stop = False
        base.waiting_drag_after_break_cut = False
        base.gatekeeper_state["scheduled_break_stop"] = False
    break_drag_seen = False
    break_command_sent = False
    break_idle_confirmations = 0
    break_cycle_counted = False


def reset_wrapper_stop_state():
    clear_cycle_stop()
    clear_break_stop()


def mark_cycle_counted(now):
    global cycle_stop_cycle_counted
    if cycle_stop_cycle_counted:
        return
    with state_lock:
        base.gatekeeper_state["cycles_completed"] += 1
        cycle_num = base.gatekeeper_state["cycles_completed"]
    base.last_increment_time = now
    base.upload_cycle_count(cycle_num)
    cycle_stop_cycle_counted = True
    return cycle_num


def mark_break_counted(now):
    global break_cycle_counted
    if break_cycle_counted:
        return
    with state_lock:
        base.gatekeeper_state["cycles_completed"] += 1
        cycle_num = base.gatekeeper_state["cycles_completed"]
    base.last_increment_time = now
    base.upload_cycle_count(cycle_num)
    break_cycle_counted = True
    return cycle_num


def complete_cycle_stop(cmd_sock):
    global cycle_stop_command_sent, cycle_stop_idle_confirmations
    if not cycle_stop_command_sent:
        print(f"[{time.strftime('%H:%M:%S')}] [CYCLE STOP] Feed/drag complete; sending stop command.")
        base.send_cancel_cmd(cmd_sock)
        cycle_stop_command_sent = True
        cycle_stop_idle_confirmations = 0
        return

    cycle_stop_idle_confirmations += 1
    if cycle_stop_idle_confirmations < 2:
        return

    clear_cycle_stop()
    print(f"[{time.strftime('%H:%M:%S')}] [CYCLE STOP] Confirmed idle after feed/drag.")
    base.broadcast_sse("cycle_stop_completed", {
        "holding": False,
        "cycles_completed": base.gatekeeper_state["cycles_completed"],
        "timestamp": time.strftime("%H:%M:%S"),
    })


def complete_break_stop(cmd_sock):
    global break_command_sent, break_idle_confirmations
    if not break_command_sent:
        print(f"[{time.strftime('%H:%M:%S')}] [BREAK STOP] Feed/drag complete; sending stop command.")
        base.send_cancel_cmd(cmd_sock)
        break_command_sent = True
        break_idle_confirmations = 0
        return

    break_idle_confirmations += 1
    if break_idle_confirmations < 2:
        return

    clear_break_stop()
    with state_lock:
        base.unlocked = False
        base.gatekeeper_state["holding"] = True
        base.gatekeeper_state["hold_reason"] = "BREAK"
    print(f"[{time.strftime('%H:%M:%S')}] [BREAK STOP] Confirmed idle after feed/drag.")
    base.broadcast_sse("break_stop_completed", {
        "reason": "BREAK",
        "holding": True,
        "cycles_completed": base.gatekeeper_state["cycles_completed"],
        "timestamp": time.strftime("%H:%M:%S"),
    })


def safe_cnc_poller_loop():
    """Poll without long outage sleeps and never stops on a cutting signal."""
    global cycle_stop_drag_seen, cycle_stop_command_sent
    global cycle_stop_idle_confirmations, break_drag_seen, break_command_sent
    global break_idle_confirmations

    status_sock, cmd_sock = create_configured_cnc_sockets()
    previous = None
    offline = False
    needs_baseline = True
    consecutive_failures = 0
    last_status_print = 0
    last_query_ms = None
    last_response_length = None

    while True:
        try:
            fields, last_query_ms, last_response_length = query_cnc_fields(status_sock)
            consecutive_failures = 0
        except (socket.timeout, OSError, ValueError) as error:
            consecutive_failures += 1
            if consecutive_failures >= OFFLINE_AFTER_CONSECUTIVE_FAILURES and not offline:
                print(
                    f"[{time.strftime('%H:%M:%S')}] CNC communication degraded after "
                    f"{consecutive_failures} consecutive failures: {error}"
                )
                offline = True
                set_state(communication="offline", display_state="CNC OFFLINE / UNREACHABLE")
                base.broadcast_sse("status", dict(base.gatekeeper_state))
            if isinstance(error, OSError) and not isinstance(error, socket.timeout):
                try:
                    status_sock.close()
                    cmd_sock.close()
                except Exception:
                    pass
                try:
                    status_sock, cmd_sock = create_configured_cnc_sockets()
                except Exception as socket_error:
                    print(f"[{time.strftime('%H:%M:%S')}] Socket recreation failed: {socket_error}")
            # Production continues during an outage. Retry promptly without
            # blocking the state machine for the original 30 seconds.
            time.sleep(min(2.0, 0.25 + consecutive_failures * 0.1))
            continue

        if offline:
            print(
                f"[{time.strftime('%H:%M:%S')}] CNC communication restored after "
                f"{consecutive_failures} consecutive failures. "
                f"round_trip_ms={last_query_ms:.1f}, response_length={last_response_length}"
            )
            offline = False
            needs_baseline = True
            set_state(communication="online")

        f2 = fields[2] if len(fields) > 2 else 0
        f3 = fields[3] if len(fields) > 3 else 0
        f5 = fields[5] if len(fields) > 5 else 0
        f9 = fields[9] if len(fields) > 9 else 0
        is_cutting = f3 == 1
        is_drag = f9 == 1 or f2 == 1
        job_active = is_cutting or is_drag
        machine_state = base.classify_cnc_state(fields)

        # A reconnect must establish a fresh baseline. Do not manufacture a
        # stale 1->0 or 0->1 edge from values captured before the outage.
        if needs_baseline or previous is None:
            previous = (f2, f3, f5, f9)
            needs_baseline = False
            with state_lock:
                pending_cycle = base.scheduled_cycle_stop
                pending_break = base.scheduled_break_stop
                base.gatekeeper_state["display_state"] = machine_state
            if pending_cycle:
                if is_drag:
                    with state_lock:
                        base.waiting_drag_after_cycle_stop = True
                    cycle_stop_drag_seen = True
                elif not job_active:
                    with state_lock:
                        base.waiting_drag_after_cycle_stop = True
                    cycle_stop_drag_seen = True
            if pending_break:
                if is_drag:
                    with state_lock:
                        base.waiting_drag_after_break_cut = True
                    break_drag_seen = True
                elif not job_active:
                    with state_lock:
                        base.waiting_drag_after_break_cut = True
                    break_drag_seen = True
            base.broadcast_sse("status", dict(base.gatekeeper_state))
            time.sleep(0.2)
            continue

        last_f2, last_f3, last_f5, last_f9 = previous
        last_is_cutting = last_f3 == 1
        last_job_active = last_f3 == 1 or last_f2 == 1 or last_f9 == 1
        cut_finished = last_is_cutting and not is_cutting

        with state_lock:
            pending_cycle = base.scheduled_cycle_stop
            waiting_cycle = base.waiting_drag_after_cycle_stop
            pending_break = base.scheduled_break_stop
            waiting_break = base.waiting_drag_after_break_cut

        # Cycle stop: a late request during drag is attached to that drag phase.
        if pending_cycle and not waiting_cycle:
            if cut_finished:
                with state_lock:
                    base.waiting_drag_after_cycle_stop = True
                cycle_stop_drag_seen = is_drag or not job_active
                cycle_num = mark_cycle_counted(time.time())
                base.broadcast_sse("cycle_stop_drag_phase", {
                    "message": "Current cycle finished. Material feeding before stop...",
                    "cycles_completed": cycle_num,
                })
            elif is_drag:
                with state_lock:
                    base.waiting_drag_after_cycle_stop = True
                cycle_stop_drag_seen = True
                cycle_num = mark_cycle_counted(time.time())
                base.broadcast_sse("cycle_stop_drag_phase", {
                    "message": "Stop request joined current material feed phase...",
                    "cycles_completed": cycle_num,
                })
            elif not job_active:
                with state_lock:
                    base.waiting_drag_after_cycle_stop = True
                cycle_stop_drag_seen = True

        elif pending_cycle and waiting_cycle:
            # Never send the normal cycle-stop command merely because cutting
            # became true. If a new cycle starts, wait for its safe boundary.
            if is_cutting:
                cycle_stop_drag_seen = False
                cycle_stop_idle_confirmations = 0
                print(f"[{time.strftime('%H:%M:%S')}] Stop pending while cutting; waiting for this cycle to finish.")
            elif is_drag:
                cycle_stop_drag_seen = True
            elif not job_active and (cycle_stop_drag_seen or cut_finished):
                complete_cycle_stop(cmd_sock)

        # Break stop follows the same no-mid-cycle rule.
        if pending_break and not waiting_break:
            if cut_finished:
                with state_lock:
                    base.waiting_drag_after_break_cut = True
                break_drag_seen = is_drag or not job_active
                cycle_num = mark_break_counted(time.time())
                base.broadcast_sse("break_drag_phase", {
                    "message": "Current cycle finished. Material feeding before break stop...",
                    "cycles_completed": cycle_num,
                })
            elif is_drag:
                with state_lock:
                    base.waiting_drag_after_break_cut = True
                break_drag_seen = True
                cycle_num = mark_break_counted(time.time())
                base.broadcast_sse("break_drag_phase", {
                    "message": "Break request joined current material feed phase...",
                    "cycles_completed": cycle_num,
                })
            elif not job_active:
                with state_lock:
                    base.waiting_drag_after_break_cut = True
                break_drag_seen = True

        elif pending_break and waiting_break:
            if is_cutting:
                break_drag_seen = False
                break_idle_confirmations = 0
            elif is_drag:
                break_drag_seen = True
            elif not job_active and (break_drag_seen or cut_finished):
                complete_break_stop(cmd_sock)

        # Normal cycle accounting is retained when no preemptive stop is armed.
        if (cut_finished and not pending_cycle and not pending_break
                and not base.gatekeeper_state.get("holding", False)):
            with state_lock:
                base.gatekeeper_state["cycles_completed"] += 1
                cycle_num = base.gatekeeper_state["cycles_completed"]
            base.last_increment_time = time.time()
            base.upload_cycle_count(cycle_num)
            base.broadcast_sse("cycle_completed", {
                "cycles_completed": cycle_num,
                "timestamp": time.strftime("%H:%M:%S"),
            })

        with state_lock:
            base.gatekeeper_state["display_state"] = machine_state
            base.gatekeeper_state["communication"] = "online"
            base.gatekeeper_state["cycle_stop_pending"] = bool(
                base.scheduled_cycle_stop or base.waiting_drag_after_cycle_stop
            )

        now = time.time()
        state_changed = previous != (f2, f3, f5, f9)
        if state_changed or now - last_status_print >= 2.0:
            last_status_print = now
            print(
                f"[{time.strftime('%H:%M:%S')}] [STATUS] State: {machine_state} | "
                f"Communication: online | Cycle stop pending: {base.gatekeeper_state['cycle_stop_pending']} | "
                f"Query: {last_query_ms:.1f}ms/{last_response_length}B"
            )
            base.broadcast_sse("status", dict(base.gatekeeper_state))

        previous = (f2, f3, f5, f9)
        time.sleep(POLL_INTERVAL_SECONDS)


def safe_schedule_cycle_stop():
    with state_lock:
        base.scheduled_cycle_stop = True
        base.waiting_drag_after_cycle_stop = False
        base.gatekeeper_state["scheduled_cycle_stop"] = True
        base.gatekeeper_state["cycle_stop_pending"] = True
    return base.schedule_cycle_stop_endpoint()


def safe_cancel_cycle_stop():
    clear_cycle_stop()
    return base.cancel_scheduled_cycle_stop_endpoint()


def safe_schedule_break_stop():
    with state_lock:
        base.scheduled_break_stop = True
        base.waiting_drag_after_break_cut = False
        base.gatekeeper_state["scheduled_break_stop"] = True
    return base.schedule_break_stop_endpoint()


def safe_cancel_break_stop():
    clear_break_stop()
    return base.cancel_scheduled_break_stop_endpoint()


def safe_unlock():
    reset_wrapper_stop_state()
    return base.unlock_gatekeeper()


def guarded_request():
    # callStop remains available for the independent operator pause control.
    if base.request.args.get("callStop") is None:
        with state_lock:
            pending = (
                base.scheduled_cycle_stop
                or base.waiting_drag_after_cycle_stop
                or base.scheduled_break_stop
                or base.waiting_drag_after_break_cut
            )
        if pending:
            return base.jsonify({
                "ok": False,
                "status": "stop_pending",
                "error": "A cycle stop is pending; no new job will be started.",
            }), 409
    return base.handle_request()


# Replace only the relevant Flask handlers and the poller. All other routes and
# Xiao automation remain the original implementation.
base.cnc_poller_loop = safe_cnc_poller_loop
base.app.view_functions["schedule_cycle_stop_endpoint"] = safe_schedule_cycle_stop
base.app.view_functions["cancel_scheduled_cycle_stop_endpoint"] = safe_cancel_cycle_stop
base.app.view_functions["schedule_break_stop_endpoint"] = safe_schedule_break_stop
base.app.view_functions["cancel_scheduled_break_stop_endpoint"] = safe_cancel_break_stop
base.app.view_functions["unlock_gatekeeper"] = safe_unlock
base.app.view_functions["handle_request"] = guarded_request


class SafeDualPortHandler(base.DualPortHandler):
    """Keep the legacy 8766 port on the same stop-state implementation."""

    def _send_json(self, payload, status=200):
        body = base.json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/schedule_break_stop":
            safe_schedule_break_stop()
            return self._send_json({
                "success": True,
                "scheduled": True,
                "message": "Waiting for current cycle to complete before stopping for break...",
                "timestamp": time.strftime("%H:%M:%S"),
            })
        if path == "/cancel_scheduled_break":
            safe_cancel_break_stop()
            return self._send_json({
                "success": True,
                "scheduled": False,
                "message": "Preemptive break stop cancelled.",
                "timestamp": time.strftime("%H:%M:%S"),
            })
        if path == "/schedule_cycle_stop":
            result = safe_schedule_cycle_stop()
            return self._send_json({
                "success": True,
                "scheduled": True,
                "message": "Waiting for current cycle to complete before stopping...",
                "timestamp": time.strftime("%H:%M:%S"),
            })
        if path == "/cancel_scheduled_cycle_stop":
            safe_cancel_cycle_stop()
            return self._send_json({
                "success": True,
                "scheduled": False,
                "message": "Preemptive cycle stop cancelled.",
                "timestamp": time.strftime("%H:%M:%S"),
            })
        if path == "/unlock":
            safe_unlock()
            return self._send_json({
                "success": True,
                "status": "UNLOCKED",
                "message": "Gatekeeper unlocked.",
                "timestamp": time.strftime("%H:%M:%S"),
            })
        return super().do_POST()

if __name__ == "__main__":
    print(f"Updated listener wrapper using: {BASE_LISTENER_PATH}")
    reset_thread = threading.Thread(target=base.daily_reset_worker, daemon=True)
    reset_thread.start()
    sync_thread = threading.Thread(target=base.cloud_sync_worker, daemon=True)
    sync_thread.start()
    poller_thread = threading.Thread(target=base.cnc_poller_supervisor, daemon=True)
    poller_thread.start()

    try:
        http_8766 = base.SilentThreadingHTTPServer(("0.0.0.0", 8766), SafeDualPortHandler)
        threading.Thread(target=http_8766.serve_forever, daemon=True).start()
    except Exception as error:
        print(f"[Notice] Port 8766 mirror could not bind: {error}")

    try:
        kb_listener = base.keyboard.Listener(on_press=base.on_press)
        kb_listener.daemon = True
        kb_listener.start()
    except Exception as error:
        print(f"[Notice] Keyboard listener could not start: {error}")

    base.app.run(host="0.0.0.0", port=5000, threaded=True)
