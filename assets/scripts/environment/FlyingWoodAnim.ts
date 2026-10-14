import { _decorator, Component, Node, Vec3 } from 'cc';
import { Backpack } from '../player/Backpack';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 飞行动画：砍树爆出的原木沿贝塞尔曲线飞上玩家的背。
 * 目标点每帧实时追踪 CarryPoint 的世界坐标（玩家在动也能跟上）。
 * 落地后把节点交给背包，自己销毁组件。
 */
@ccclass('FlyingWoodAnim')
export class FlyingWoodAnim extends Component {

    private _startPos: Vec3 = new Vec3();
    private _targetIndex: number = 0;
    private _player: Node = null;
    private _carryPoint: Node = null;
    private _backpack: Backpack = null;
    private _duration: number = 0.6;
    private _delay: number = 0;
    private _elapsed: number = 0;
    private _jumpHeight: number = 3.0;

    init(startPos: Vec3, targetIndex: number, player: Node, carryPoint: Node, backpack: Backpack, delay: number) {
        this._startPos.set(startPos);
        this._targetIndex = targetIndex;
        this._player = player;
        this._carryPoint = carryPoint;
        this._backpack = backpack;
        this._delay = delay;
        this._elapsed = 0;

        // 初始横放
        this._updateRotation();
    }

    update(dt: number) {
        if (!this._player || !this._player.isValid) {
            NodePool.put(this.node);
            return;
        }

        this._elapsed += dt;
        if (this._elapsed < this._delay) return;

        const flyTime = this._elapsed - this._delay;
        if (flyTime >= this._duration) {
            this._land();
            return;
        }

        const t = flyTime / this._duration;
        const carryWorld = this._carryPoint.worldPosition;

        // 直接用 CarryPoint 世界坐标作为目标
        const targetPos = new Vec3(
            carryWorld.x,
            carryWorld.y + this._targetIndex * 0.35,
            carryWorld.z
        );

        // 抛物线中点（跳高）
        const midPos = new Vec3(
            (this._startPos.x + targetPos.x) * 0.5,
            Math.max(this._startPos.y, targetPos.y) + this._jumpHeight,
            (this._startPos.z + targetPos.z) * 0.5
        );

        // 二阶贝塞尔曲线
        const oneMinusT = 1 - t;
        const pos = new Vec3();
        pos.x = oneMinusT * oneMinusT * this._startPos.x + 2 * oneMinusT * t * midPos.x + t * t * targetPos.x;
        pos.y = oneMinusT * oneMinusT * this._startPos.y + 2 * oneMinusT * t * midPos.y + t * t * targetPos.y;
        pos.z = oneMinusT * oneMinusT * this._startPos.z + 2 * oneMinusT * t * midPos.z + t * t * targetPos.z;

        this.node.setPosition(pos);
        this._updateRotation();
    }

    private _updateRotation() {
        const playerEuler = new Vec3();
        this._player.worldRotation.getEulerAngles(playerEuler);
        this.node.setRotationFromEuler(0, playerEuler.y + 90, 0);
    }

    private _land() {
        // 兜底：挂点或背包失效就回收，绝不悬在半空
        if (!this._carryPoint || !this._carryPoint.isValid || !this._backpack) {
            NodePool.put(this.node);
            return;
        }
        if (!this._backpack.canAdd(this.node)) {   // 装不下了，回池
            NodePool.put(this.node);
            return;
        }
        this.node.setParent(this._carryPoint);
        this.node.setPosition(0, this._targetIndex * 0.35, -0.4);
        this.node.setRotationFromEuler(0, 90, 0);
        this._backpack.addWoodAnimated(this.node);
        this.destroy();
    }
}
