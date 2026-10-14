import { _decorator, Component, Node, Vec3, SkeletalAnimation, RigidBody, CCFloat, CCString } from 'cc';
import { Joystick, JoystickOutput } from '../ui/Joystick';
import { Backpack } from './Backpack';

const { ccclass, property } = _decorator;

/**
 * 玩家控制器：摇杆输入 → 相机相对方向移动（刚体速度驱动），
 * 斧头/电锯双工具切换（升级后伤害 1 → 2，动画同步换）。
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ type: CCFloat })
    moveSpeed: number = 5;

    @property(Joystick)
    joystick: Joystick = null;

    @property(Node)
    cameraRig: Node = null;

    @property(Node)
    toolNode: Node = null;

    @property({ type: Backpack })
    backpack: Backpack = null!;

    @property({ type: Node, tooltip: '背上的堆叠挂点' })
    carryPoint: Node = null!;

    @property({ type: Node, tooltip: '斧头节点（已绑在右手骨骼上）' })
    axeNode: Node = null;

    @property({ type: Node, tooltip: '电锯节点（绑在右手骨骼上，初始隐藏）' })
    chainsawNode: Node = null;

    @property({ type: CCString, tooltip: '斧头砍树动画名' })
    axeAnimName: string = 'ZuoYou_KanShu';

    @property({ type: CCString, tooltip: '电锯切割动画名，按实际动画剪辑名填' })
    chainsawAnimName: string = 'DianJu_QieGe';

    /** 当前对树的伤害：斧头 1，电锯 2 */
    public chopDamage: number = 1;

    private _chopAnimName: string = 'ZuoYou_KanShu';

    private _anim: SkeletalAnimation = null;
    private _rb: RigidBody = null;
    private _moveDir: Vec3 = new Vec3();
    private _moveMag: number = 0;
    private _isMoving: boolean = false;
    private _isChopping: boolean = false;
    private _joystickHandler: (out: JoystickOutput) => void = null;

    onLoad() {
        this._anim = this.node.getComponentInChildren(SkeletalAnimation);
        this._rb = this.node.getComponent(RigidBody);

        if (!this._rb) {
            console.error('[Player] 玩家没有 RigidBody！');
            return;
        }

        this._rb.useGravity = false;
        (this._rb as any).mass = 1;

        if (this.joystick) {
            this._joystickHandler = this._onJoystick.bind(this);
            this.joystick.onOutput(this._joystickHandler);
        }
        if (this.toolNode) this.toolNode.active = true;
    }

    onDestroy() {
        // 注意：必须用同一个函数引用解绑，再 bind 一次会生成新函数导致解绑失败
        if (this.joystick && this._joystickHandler) {
            this.joystick.offOutput(this._joystickHandler);
        }
    }

    start() {
        this._chopAnimName = this.axeAnimName;
        if (this.chainsawNode) this.chainsawNode.active = false;   // 电锯初始隐藏
        if (this.axeNode) this.axeNode.active = true;
    }

    playChop(): void {
        if (!this._anim || this._isChopping) return;
        this._isChopping = true;
        if (this.toolNode) this.toolNode.active = true;

        this._anim.play(this._chopAnimName);
        setTimeout(() => {
            this._isChopping = false;
            if (this._isMoving) this._anim.play('Run');
            else this._anim.play('Idle');
        }, 400);
    }

    /** 升级成电锯：藏斧头、亮电锯、伤害变 2、换动画 */
    upgradeToChainsaw() {
        if (this.axeNode) this.axeNode.active = false;
        if (this.chainsawNode) this.chainsawNode.active = true;
        this.chopDamage = 2;
        this._chopAnimName = this.chainsawAnimName;
    }

    private _onJoystick(out: JoystickOutput) {
        this._moveDir.set(out.direction);
        this._moveMag = out.magnitude;
        const wasMoving = this._isMoving;
        this._isMoving = out.magnitude > 0.1;

        if (this._isChopping) return;

        if (this._anim) {
            if (this._isMoving && !wasMoving) this._anim.play('Run');
            else if (!this._isMoving && wasMoving) this._anim.play('Idle');
        }
    }

    update(dt: number) {
        if (!this._rb || !this.cameraRig) return;

        if (!this._isMoving) {
            this._rb.setLinearVelocity(Vec3.ZERO);
            return;
        }

        // 相机相对方向：摇杆方向映射到相机的前后左右
        const forward = this.cameraRig.forward.clone();
        forward.y = 0;
        if (forward.length() > 0.01) forward.normalize();

        const right = this.cameraRig.right.clone();
        right.y = 0;
        if (right.length() > 0.01) right.normalize();

        const inputX = this._moveDir.x;
        const inputY = -this._moveDir.z;

        const worldDir = new Vec3();
        Vec3.scaleAndAdd(worldDir, worldDir, right, inputX);
        Vec3.scaleAndAdd(worldDir, worldDir, forward, inputY);
        if (worldDir.length() > 0.01) worldDir.normalize();

        const velocity = worldDir.clone().multiplyScalar(this.moveSpeed * this._moveMag);
        this._rb.setLinearVelocity(velocity);

        if (worldDir.length() > 0.01) {
            const lookTarget = this.node.position.clone().add(worldDir);
            this.node.lookAt(lookTarget);
            const euler = this.node.eulerAngles;
            this.node.setRotationFromEuler(euler.x, euler.y + 180, euler.z);
        }
    }
}
