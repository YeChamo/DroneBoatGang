import BT from './BluetoothManager';

class CommandLoop {
  latest = { steering: 0, throttle: 0 };
  lastSent = '';
  timer = null;
  sending = false;

  hz = 20;
  deadzone = 0.25;
  hysteresis = 0.05;
  lastQuant = { steering: 0, throttle: 0 };

  start() {
    if (this.timer) return;
    const interval = Math.max(20, Math.round(1000 / this.hz));
    this.timer = setInterval(() => this.tick(), interval);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  setSteering(x) { this.latest.steering = x; }
  setThrottle(y) { this.latest.throttle = y; }

  q(v) {
    if (Math.abs(v) < this.deadzone) return 0;
    return Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
  }

  selectCmd(s, t) {
    if (t <= -this.deadzone) return '1';
    if (t >=  this.deadzone) return '2';
    if (s <= -this.deadzone) return '3';
    if (s >=  this.deadzone) return '4';
    return '0';
  }

  changedEnough(a, b) {
    return Math.abs(a.steering - b.steering) > this.hysteresis ||
           Math.abs(a.throttle - b.throttle) > this.hysteresis;
  }

  async tick() {
    const qs = this.q(this.latest.steering);
    const qt = this.q(this.latest.throttle);

    if (!this.changedEnough({ steering: qs, throttle: qt }, this.lastQuant) && this.lastSent !== '') return;

    const cmd = this.selectCmd(qs, qt);
    if (cmd === this.lastSent) { this.lastQuant = { steering: qs, throttle: qt }; return; }
    if (this.sending) { this.lastQuant = { steering: qs, throttle: qt }; return; }

    this.sending = true;
    try {
      if (await BT.isConnected()) {
        await BT.write(cmd + '\n');
        this.lastSent = cmd;
        this.lastQuant = { steering: qs, throttle: qt };
      } else {
        this.lastSent = '';
      }
    } catch {
      this.lastSent = '';
    } finally {
      this.sending = false;
    }
  }
}

export default new CommandLoop();
