import { _decorator, Component, Node, Vec3, tween, CCString } from 'cc';
import { PlayerController } from '../player/PlayerController';

const { ccclass, property } = _decorator;

/**
 * 堆叠区基类：网格堆叠 + 抛物线飞入 + LIFO 出栈 + 布局旋转。
 *
 * 子类只需要：
 *   1. 实现 _layoutPos() 定义自己的网格布局；
 *   2. 按需设置 itemYawOffset（物品落地朝向 = zoneRotation.y + itemYawOffset）；
 *   3. 写各自的触发逻辑（玩家放下 / 玩家拾取 / 装车等）。
 *
 * 并发安全约定：
 *   _items 里永远只有"已落地"的物品，出栈直接 pop 栈顶，随时可取；
 *   飞行中的物品用 _incoming 计数预估目标位，落地瞬间按当时栈顶重算位置 —— 堆叠永不出洞。
 */
@ccclass('StackZone')
export class StackZone extends Component {

    @property({ type: PlayerController })
    player: PlayerController = null!;

    @property({ type: CCString, tooltip: '只接收这个名字前缀的物品，例如 RawWood_ / Log_ / Plank_' })
    acceptPrefix: string = '';

    @property({ tooltip: '区域旋转（欧拉角，度）。物品朝向和布局方向都会跟着转，改属性后已放置的物品也会实时更新' })
    zoneRotation: Vec3 = new Vec3(0, 0, 0);

    /** 物品落地时的朝向偏移：落地旋转 = zoneRotation.y + itemYawOffset */
    protected itemYawOffset: number = 0;

    /** 已落地的物品（栈，后进先出） */
    protected _items: Node[] = [];

    /** 正在飞往本区的数量（仅用于预估飞行目标位） */
    protected _incoming: number = 0;

    private _lastRotation: Vec3 = new Vec3(0, 0, 0);
    private _rotationInited: boolean = false;

    get count(): number { return this._items.length; }

    /** 取走一个（后进先出）。可并发：只取已落地的，飞行中的不影响 */
    takeOne(): Node | null {
        if (this._items.length === 0) return null;
        return this._items.pop()!;
    }

    /** 外部送入（传送带 / 机器 / 工人统一入口） */
    receiveItem(item: Node, startWorldPos: Vec3) {
        this._flyIn(item, startWorldPos);
    }

    /** 子类 update 开头调用：编辑器里改了 zoneRotation 就把已放置的物品重排 */
    protected _syncRotationIfChanged() {
        if (!this._rotationInited) {
            this._lastRotation.set(this.zoneRotation);
            this._rotationInited = true;
            return;
        }
        if (!this._lastRotation.equals(this.zoneRotation)) {
            this._lastRotation.set(this.zoneRotation);
            this._relayoutAll();
        }
    }

    /**
     * 抛物线飞入堆叠区。
     * 起飞时按"已落地数 + 在飞数"预估目标位；落地瞬间按当时栈顶重算，
     * 因此放进和取出可以完全并发，堆叠也永远连续无洞。
     */
    protected _flyIn(item: Node, startWorldPos: Vec3, onLanded?: () => void) {
        // 统一接管父节点 + 恢复世界坐标（玩家/工人/传送带送来的都从这里进）
        item.setParent(this.node);
        item.setWorldPosition(startWorldPos);

        const estimatedIndex = this._items.length + this._incoming;
        this._incoming++;

        const targetWorldPos = new Vec3();
        this.node.getWorldPosition(targetWorldPos);
        targetWorldPos.add(this._layoutPos(estimatedIndex));

        const midPos = new Vec3(
            (startWorldPos.x + targetWorldPos.x) / 2,
            Math.max(startWorldPos.y, targetWorldPos.y) + 2.5,
            (startWorldPos.z + targetWorldPos.z) / 2
        );

        const rot = this.zoneRotation;
        const yaw = this.itemYawOffset;

        tween(item)
            .to(0.2, { worldPosition: midPos }, { easing: 'quadOut' })
            .to(0.2, { worldPosition: targetWorldPos }, { easing: 'bounceOut' })
            .call(() => {
                // 落地瞬间按当时栈顶重算位置，保证连续无洞
                this._items.push(item);
                item.setPosition(this._layoutPos(this._items.length - 1));
                item.setRotationFromEuler(rot.x, rot.y + yaw, rot.z);
                this._incoming--;
                if (onLanded) onLanded();
            })
            .start();
    }

    /** 按数组下标重排所有已落地物品（布局/旋转变更后调用） */
    protected _relayoutAll() {
        const rot = this.zoneRotation;
        for (let i = 0; i < this._items.length; i++) {
            const item = this._items[i];
            item.setPosition(this._layoutPos(i));
            item.setRotationFromEuler(rot.x, rot.y + this.itemYawOffset, rot.z);
        }
    }

    /** 把局部坐标绕 Y 轴旋转 zoneRotation.y 度 */
    protected _rotateY(x: number, y: number, z: number): Vec3 {
        const rad = this.zoneRotation.y * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return new Vec3(x * cos + z * sin, y, -x * sin + z * cos);
    }

    /** 子类实现：第 index 个物品的局部堆叠位置 */
    protected _layoutPos(index: number): Vec3 {
        return new Vec3();
    }
}
