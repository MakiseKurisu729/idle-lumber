import { _decorator, Component, Node, Vec3, Prefab, instantiate, CCFloat, CCString, director } from 'cc';
import { PickupZone } from './PickupZone';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

function hasPrefix(n: Node, prefix: string): boolean {
    return !!n && n.isValid && !!prefix && n.name.startsWith(prefix);
}

/**
 * 加工机器：真实物品从入口进来直接消耗，产出物从出口生成并飞往下游拾取区。
 *
 * 注意：加工过程是纯展示动画（cycleDuration 与实际出料节奏无关），
 * 真实数据流由 receiveWood 驱动 —— 表现与数据分离。
 */
@ccclass('Machine')
export class Machine extends Component {

    @property(Node) entryPoint: Node = null;
    @property(Node) exitPoint: Node = null;

    @property({ type: Node, tooltip: '放置区节点，机器内物品角度跟它的 zoneRotation 走' })
    dropZoneNode: Node = null;

    @property({ type: CCString, tooltip: '这台机器收什么（名字前缀）：机器1填 RawWood_，机器2填 Log_' })
    inputPrefix: string = 'RawWood_';

    @property({ type: CCString, tooltip: '这台机器产出什么（名字前缀）：机器1填 Log_，机器2填 Plank_' })
    outputPrefix: string = 'Log_';

    @property({ type: CCFloat, tooltip: '展示动画一轮的时长（秒），随便调，与实际出料节奏无关' })
    cycleDuration: number = 1.2;

    @property({ type: CCFloat, tooltip: '展示动画里输入物变产出物的位置（0~1，0.5 = 走到中间变身）' })
    processRatio: number = 0.5;

    @property({ type: Prefab, tooltip: '展示动画用的输入物预制体（机器1放原木，机器2放圆木）' })
    inputDisplayPrefab: Prefab = null;

    @property({ type: Prefab, tooltip: '产出物预制体（机器1放圆木，机器2放木板）' })
    outputPrefab: Prefab = null;

    @property(PickupZone) pickupZone: PickupZone = null;

    // ===== 展示动画状态 =====
    private _animRunning: boolean = false;
    private _animNode: Node = null;
    private _animIsOutput: boolean = false;
    private _animT: number = 0;

    /**
     * DropZone / ConveyorBelt 调用：真实物品到入口后直接消耗，产出物在出口生成并飞走
     * @param isLast 这是不是来源当前最后一个（是 → 产出物出现在出口时停动画）
     */
    receiveWood(wood: Node, isLast: boolean = false): void {
        if (!hasPrefix(wood, this.inputPrefix)) {
            console.warn(`[Machine] 拒绝加工，需要 ${this.inputPrefix}，收到：`, wood?.name);
            return;
        }
        if (!this.outputPrefab) {
            console.error('[Machine] 没有设置 outputPrefab');
            return;
        }

        NodePool.put(wood);

        const output = NodePool.get(this.outputPrefab);
        output.name = `${this.outputPrefix}${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        const scene = this.node.parent || director.getScene();
        const exitPos = this.exitPoint.worldPosition.clone();
        output.setParent(scene);
        output.setWorldPosition(exitPos);

        const pickup = (this.pickupZone || director.getScene().getComponentInChildren(PickupZone)) as PickupZone | null;
        if (!pickup) {
            console.error('[Machine] 没找到 PickupZone');
            return;
        }
        pickup.receivePlank(output, exitPos);

        if (isLast) {
            this._stopAnim();
        } else {
            this._startAnim();
        }
    }

    update(dt: number) {
        if (!this._animRunning || !this._animNode || !this.entryPoint || !this.exitPoint) return;

        this._animT += dt / this.cycleDuration;

        if (!this._animIsOutput && this._animT >= this.processRatio) {
            this._swapAnimToOutput();
        }

        if (this._animT >= 1) {
            this._spawnAnimInput();
        }

        const pos = new Vec3();
        Vec3.lerp(pos, this.entryPoint.position, this.exitPoint.position, Math.min(this._animT, 1));
        this._animNode.setPosition(pos);
    }

    // ========== 展示动画控制 ==========

    /** 读取放置区的 zoneRotation，没拖就不旋转 */
    private _getZoneRotation(): Vec3 {
        const dz: any = this.dropZoneNode ? this.dropZoneNode.getComponent('DropZone') : null;
        if (dz && dz.zoneRotation) return dz.zoneRotation;
        return Vec3.ZERO;
    }

    private _startAnim() {
        if (this._animRunning) return;
        if (!this.inputDisplayPrefab || !this.outputPrefab) {
            console.warn('[Machine] inputDisplayPrefab / outputPrefab 没拖，展示动画跳过');
            return;
        }
        this._animRunning = true;
        this._spawnAnimInput();
    }

    private _spawnAnimInput() {
        this._clearAnimNode();
        this._animNode = instantiate(this.inputDisplayPrefab);
        this._animNode.setParent(this.node);
        this._animNode.setPosition(this.entryPoint.position);
        const rot = this._getZoneRotation();
        this._animNode.setRotationFromEuler(rot.x, rot.y, rot.z);
        this._animIsOutput = false;
        this._animT = 0;
    }

    private _swapAnimToOutput() {
        const pos = this._animNode ? this._animNode.position.clone() : this.entryPoint.position.clone();
        this._clearAnimNode();
        this._animNode = instantiate(this.outputPrefab);
        this._animNode.setParent(this.node);
        this._animNode.setPosition(pos);
        const rot = this._getZoneRotation();
        this._animNode.setRotationFromEuler(rot.x, rot.y, rot.z);
        this._animIsOutput = true;
    }

    private _stopAnim() {
        this._animRunning = false;
        this._clearAnimNode();
    }

    private _clearAnimNode() {
        if (this._animNode && this._animNode.isValid) this._animNode.destroy();
        this._animNode = null;
    }
}
