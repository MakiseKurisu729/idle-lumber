import { _decorator, Component, Node, Vec3, EventTouch, UITransform } from 'cc';

const { ccclass, property } = _decorator;

export interface JoystickOutput {
    direction: Vec3;
    magnitude: number;
}

/**
 * 虚拟摇杆：触点即摇杆中心（跟随手指出现），输出归一化方向 + 力度。
 * 注意：Bg/Stick 的位置都用 worldPosition 设置，不受父节点层级影响。
 */
@ccclass('Joystick')
export class Joystick extends Component {

    @property(Node)
    bg: Node = null;

    @property(Node)
    stick: Node = null;

    private _radius: number = 0;
    private _dir: Vec3 = new Vec3();
    private _mag: number = 0;
    private _isTouching: boolean = false;
    private _callbacks: ((out: JoystickOutput) => void)[] = [];

    onLoad() {
        const uiTransform = this.bg.getComponent(UITransform);
        this._radius = uiTransform.width / 2;

        this._hideJoystick();

        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    onOutput(callback: (out: JoystickOutput) => void) {
        this._callbacks.push(callback);
    }

    offOutput(callback: (out: JoystickOutput) => void) {
        const idx = this._callbacks.indexOf(callback);
        if (idx >= 0) this._callbacks.splice(idx, 1);
    }

    private _onTouchStart(event: EventTouch) {
        this._isTouching = true;

        const touchPos = event.getUILocation();

        // 触点即摇杆中心：用 worldPosition 设置，不受父子层级影响
        this.bg.setWorldPosition(touchPos.x, touchPos.y, 0);
        this.stick.setWorldPosition(touchPos.x, touchPos.y, 0);

        this._showJoystick();

        this._mag = 0;
        this._dir.set(0, 0, 0);
        this._notify();
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._isTouching) return;

        const touchPos = event.getUILocation();
        const bgPos = this.bg.worldPosition;

        // 计算触摸点相对于 Bg 中心的偏移
        const dx = touchPos.x - bgPos.x;
        const dy = touchPos.y - bgPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 限制在圆内：Stick 圆心不能超过 Bg 边界
        let finalDx = dx;
        let finalDy = dy;
        if (dist > this._radius) {
            const ratio = this._radius / dist;
            finalDx = dx * ratio;
            finalDy = dy * ratio;
        }

        this.stick.setWorldPosition(bgPos.x + finalDx, bgPos.y + finalDy, 0);

        this._mag = Math.min(dist / this._radius, 1.0);

        if (dist > 0) {
            this._dir.set(dx / dist, 0, -dy / dist);
        }

        this._notify();
    }

    private _onTouchEnd() {
        this._isTouching = false;
        this._hideJoystick();

        this._mag = 0;
        this._dir.set(0, 0, 0);
        this._notify();
    }

    private _showJoystick() {
        this.bg.active = true;
        this.stick.active = true;
    }

    private _hideJoystick() {
        this.bg.active = false;
        this.stick.active = false;
    }

    private _notify() {
        const out: JoystickOutput = {
            direction: this._dir.clone(),
            magnitude: this._mag
        };
        for (const cb of this._callbacks) {
            cb(out);
        }
    }
}
