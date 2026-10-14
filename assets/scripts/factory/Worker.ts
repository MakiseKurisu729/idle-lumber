import { _decorator, Component, Node, Vec3, Prefab, tween, SkeletalAnimation, CCFloat, CCString, director } from 'cc';
import { FloatingWood, WoodState } from '../environment/FloatingWood';
import { DropZone } from './DropZone';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 工人：自动寻找最近的空闲漂木，走过去砍，砍倒后原木直接飞去放置区（不上背）。
 *
 * 设计要点：
 * - 认领锁：每根木头同时只许一个工人盯（claimedBy），防止所有工人挤同一根；
 * - 动画缓存：只在切换动画时才真正 play，避免每帧重头播。
 */
@ccclass('Worker')
export class Worker extends Component {

    @property({ type: CCFloat })
    moveSpeed: number = 4;

    @property({ type: CCFloat, tooltip: '距离木头多远开始砍' })
    chopRange: number = 1.8;

    @property({ type: CCFloat, tooltip: '砍一刀的间隔（秒）' })
    chopInterval: number = 0.9;

    @property({ type: CCString, tooltip: '砍树动画名（工人拿斧头）' })
    chopAnimName: string = 'ZuoYou_KanShu';

    @property({ type: DropZone, tooltip: '砍完的原木飞到这个放置区（由 SpendZone 生成时注入）' })
    dropZone: DropZone = null;

    @property({ type: Prefab, tooltip: '原木预制体（同砍树生成的那个）' })
    woodPickupPrefab: Prefab = null;

    private _anim: SkeletalAnimation = null;
    private _target: FloatingWood = null;
    private _chopTimer: number = 0;
    private _isChopping: boolean = false;
    private _currentAnim: string = '';

    onLoad() {
        this._anim = this.node.getComponentInChildren(SkeletalAnimation);
    }

    start() {
        // 兜底：没注入就自动找场景里第一个 DropZone
        if (!this.dropZone) {
            this.dropZone = director.getScene().getComponentInChildren(DropZone);
            if (!this.dropZone) console.error('[Worker] 没找到放置区！');
        }
    }

    onDestroy() {
        this._releaseTarget();
    }

    update(dt: number) {
        // 目标失效（被砍了/被销毁）就释放锁重新找
        if (this._target && (!this._target.node || !this._target.node.isValid || this._target.state === WoodState.DROPPED)) {
            this._releaseTarget();
        }
        if (!this._target) {
            this._target = this._findNearestWood();
            if (!this._target) {
                this._playAnim('Idle');
                return;
            }
        }

        const myPos = this.node.worldPosition.clone();
        const tPos = this._target.node.worldPosition;
        const dist = Vec3.distance(myPos, tPos);

        if (dist > this.chopRange) {
            // 走向目标
            const dir = tPos.clone().subtract(myPos);
            dir.y = 0;
            if (dir.length() > 0.01) dir.normalize();
            myPos.add(dir.multiplyScalar(this.moveSpeed * dt));
            this.node.setWorldPosition(myPos);

            // 面向目标（模型朝向反了 180 度，转回来）
            const look = tPos.clone();
            look.y = myPos.y;
            this.node.lookAt(look);
            const euler = this.node.eulerAngles;
            this.node.setRotationFromEuler(euler.x, euler.y + 180, euler.z);

            this._playAnim('Run');
        } else {
            // 到跟前了，开砍
            this._chopTimer += dt;
            if (this._chopTimer >= this.chopInterval) {
                this._chopTimer = 0;
                this._chop();
            }
        }
    }

    private _findNearestWood(): FloatingWood | null {
        let bestFree: FloatingWood = null, bestFreeDist = Number.MAX_VALUE;
        let bestAny: FloatingWood = null, bestAnyDist = Number.MAX_VALUE;
        const myPos = this.node.worldPosition;

        for (const w of FloatingWood.all) {
            if (!w || !w.node || !w.node.isValid) continue;
            if (w.state === WoodState.DROPPED) continue;

            const d = Vec3.distance(myPos, w.node.worldPosition);

            if (d < bestAnyDist) { bestAnyDist = d; bestAny = w; }

            // 没被其他工人锁定的才算"空闲"
            const lockedByOther = w.claimedBy && w.claimedBy !== this
                && w.claimedBy.node && w.claimedBy.node.isValid;
            if (!lockedByOther && d < bestFreeDist) { bestFreeDist = d; bestFree = w; }
        }

        const pick = bestFree || bestAny;   // 优先空闲的；全被锁了就挤一挤
        if (pick) pick.claimedBy = this;    // 锁定
        return pick;
    }

    /** 释放对目标的锁定 */
    private _releaseTarget() {
        if (this._target && this._target.claimedBy === this) {
            this._target.claimedBy = null;
        }
        this._target = null;
    }

    private _chop() {
        const target = this._target;
        if (!target || !target.node || !target.node.isValid) return;

        target.setState(WoodState.CHOPPABLE);

        // 播砍树动画（直接播，400ms 内 _isChopping 锁住不被 Run/Idle 打断）
        this._isChopping = true;
        if (this._anim) {
            this._currentAnim = this.chopAnimName;
            this._anim.play(this.chopAnimName);
        }

        setTimeout(() => {
            this._isChopping = false;
            this._currentAnim = '';   // 清空，让下一帧重新决定播 Run/Idle

            if (!target.node || !target.node.isValid) return;
            if (target.state !== WoodState.CHOPPABLE) return;

            const destroyed = target.chop(1);   // 工人拿斧头，伤害 1
            if (destroyed) {
                const woodNode = target.node;
                const woodPos = woodNode.worldPosition.clone();

                tween(woodNode)
                    .to(0.2, { scale: new Vec3(0.01, 0.01, 0.01) })
                    .call(() => { if (woodNode.isValid) woodNode.destroy(); })
                    .start();

                this._releaseTarget();
                this._spawnToDropZone(woodPos);
            }
        }, 400);
    }

    /** 砍倒后：原木直接飞去放置区，不上工人的背 */
    private _spawnToDropZone(woodPos: Vec3) {
        if (!this.woodPickupPrefab || !this.dropZone) return;
        const scene = director.getScene();

        for (let i = 0; i < 6; i++) {
            const wood = NodePool.get(this.woodPickupPrefab);
            wood.name = `RawWood_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
            wood.setParent(scene);
            wood.setWorldPosition(woodPos);

            // 错开起飞，避免挤在一起
            this.scheduleOnce(() => {
                if (wood.isValid) this.dropZone.receiveItem(wood, woodPos);
            }, i * 0.08);
        }
    }

    /** 只在切换动画时才真正播放，避免每帧重头播 */
    private _playAnim(name: string) {
        if (!this._anim || this._isChopping) return;
        if (this._currentAnim === name) return;
        this._currentAnim = name;
        this._anim.play(name);
    }
}
