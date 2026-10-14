import { _decorator, Component, Node, Vec3, tween, CCFloat } from 'cc';
import { Machine } from './Machine';
import { DropZone } from './DropZone';
import { PickupZone } from './PickupZone';
import { TruckZone } from './TruckZone';

const { ccclass, property } = _decorator;

interface BeltItem {
    node: Node;
    t: number;   // 在带子上的进度 0~1
}

/**
 * 传送带：定时从来源区拉一个物品 → 抛物线飞上带 → 匀速移动（保持间距）→ 到终点交付。
 *
 * 设计要点：
 * - 单向引用：传送带认识各区，各区不认识传送带，避免循环依赖；
 * - start() 里给来源区打 externalTransport 标记，被接管的区停止自发行为
 *   （放置区不再自己送机器，拾取区不再让玩家捡）。
 */
@ccclass('ConveyorBelt')
export class ConveyorBelt extends Component {

    @property({ type: Node, tooltip: '上带位置（传送带起点）' })
    startPoint: Node = null;

    @property({ type: Node, tooltip: '下带位置（传送带终点）' })
    endPoint: Node = null;

    @property({ type: CCFloat, tooltip: '传送速度（米/秒）' })
    speed: number = 1.5;

    @property({ type: CCFloat, tooltip: '物品之间的最小间距' })
    spacing: number = 0.6;

    @property({ type: CCFloat, tooltip: '每隔多少秒从来源取一个物品' })
    pullInterval: number = 0.3;

    @property({ tooltip: '物品在带子上的朝向' })
    itemRotation: Vec3 = new Vec3(0, 0, 0);

    // ===== 来源：二选一 =====
    @property({ type: DropZone, tooltip: '从这个放置区拉货' })
    sourceDropZone: DropZone = null;

    @property({ type: PickupZone, tooltip: '或从这个拾取区拉货' })
    sourcePickup: PickupZone = null;

    // ===== 终点：三选一 =====
    @property({ type: DropZone, tooltip: '送到这个放置区' })
    targetDropZone: DropZone = null;

    @property({ type: Machine, tooltip: '或送进这台机器' })
    targetMachine: Machine = null;

    @property({ type: TruckZone, tooltip: '或送到木板区' })
    targetTruck: TruckZone = null;

    private _items: BeltItem[] = [];
    private _pullTimer: number = 0;
    private _pulling: boolean = false;   // 有物品正从来源飞向上带点

    start() {
        // 传送带接管来源区的出货行为
        if (this.sourceDropZone) this.sourceDropZone.externalTransport = true;
        if (this.sourcePickup) this.sourcePickup.externalTransport = true;
    }

    update(dt: number) {
        if (!this.startPoint || !this.endPoint) return;

        // 定时从来源拉货
        this._pullTimer += dt;
        if (this._pullTimer >= this.pullInterval) {
            this._pullTimer = 0;
            this._tryPull();
        }

        // 带上移动
        const a = this.startPoint.position;
        const b = this.endPoint.position;
        const length = Vec3.distance(a, b);
        if (length < 0.01) return;

        for (let i = 0; i < this._items.length; i++) {
            const it = this._items[i];
            if (!it.node || !it.node.isValid) { this._items.splice(i--, 1); continue; }

            let t = it.t + (this.speed * dt) / length;

            // 与前一个物品保持间距（索引 0 是队首，最靠近终点）
            if (i > 0) {
                const prev = this._items[i - 1];
                t = Math.min(t, prev.t - this.spacing / length);
            }

            it.t = Math.max(0, Math.min(t, 1));
            const pos = new Vec3();
            Vec3.lerp(pos, a, b, it.t);
            it.node.setPosition(pos);
        }

        // 队首到达终点 → 交付
        if (this._items.length > 0 && this._items[0].t >= 1) {
            const it = this._items.shift()!;
            this._deliver(it.node);
        }
    }

    private _tryPull() {
        if (this._pulling) return;
        const source = this.sourceDropZone || this.sourcePickup;
        if (!source) return;

        // 起点处没空位（队尾还没走远）→ 这轮先不拉
        if (this._items.length > 0) {
            const length = Vec3.distance(this.startPoint.position, this.endPoint.position);
            const lastT = this._items[this._items.length - 1].t;
            if (lastT < this.spacing / length) return;
        }

        const item = source.takeOne();
        if (!item) return;

        this._pulling = true;

        const startWorld = item.worldPosition.clone();
        item.setParent(this.node);
        item.setWorldPosition(startWorld);

        const endWorld = this.startPoint.worldPosition.clone();
        const midPos = new Vec3(
            (startWorld.x + endWorld.x) / 2,
            Math.max(startWorld.y, endWorld.y) + 2.0,
            (startWorld.z + endWorld.z) / 2
        );

        tween(item)
            .to(0.05, { worldPosition: midPos }, { easing: 'quadOut' })
            .to(0.05, { worldPosition: endWorld }, { easing: 'quadIn' })
            .call(() => {
                item.setPosition(this.startPoint.position);
                item.setRotationFromEuler(this.itemRotation.x, this.itemRotation.y, this.itemRotation.z);
                this._items.push({ node: item, t: 0 });
                this._pulling = false;
            })
            .start();
    }

    private _deliver(item: Node) {
        const worldPos = item.worldPosition.clone();

        if (this.targetDropZone) {
            this.targetDropZone.receiveItem(item, worldPos);
        } else if (this.targetMachine) {
            // isLast：带上清空且来源也没货了
            this.targetMachine.receiveWood(item, this._items.length === 0 && !this._sourceHasMore());
        } else if (this.targetTruck) {
            this.targetTruck.receiveItem(item, worldPos);
        } else {
            console.warn('[ConveyorBelt] 没有设置终点，物品滞留：', item.name);
        }
    }

    private _sourceHasMore(): boolean {
        if (this.sourceDropZone) return this.sourceDropZone.count > 0;
        if (this.sourcePickup) return this.sourcePickup.count > 0;
        return false;
    }
}
