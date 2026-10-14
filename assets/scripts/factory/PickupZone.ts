import { _decorator, Node, Vec3, tween, CCFloat } from 'cc';
import { StackZone } from './StackZone';

const { ccclass, property } = _decorator;

/**
 * 拾取区：接收机器产出的物品并堆叠，玩家靠近时逐个捡上背。
 * 堆叠 / 飞入 / 出栈逻辑都在基类 StackZone，这里只写"玩家拾取"。
 */
@ccclass('PickupZone')
export class PickupZone extends StackZone {

    @property({ type: CCFloat })
    pickupRange: number = 2;

    @property({ type: CCFloat })
    pickupInterval: number = 0.15;

    @property({ tooltip: '物品背到玩家背上时的旋转（对齐背包用），默认 (0, 90, 0)' })
    carryRotation: Vec3 = new Vec3(0, 90, 0);

    /** 传送带接管标记：有传送带从这里拉货时，玩家不能再捡（由 ConveyorBelt 自动设置） */
    public externalTransport: boolean = false;

    /** 木板类物品落地朝向要 +90 才和机器、传送带上的视觉一致 */
    protected itemYawOffset = 90;

    private _picking: number = 0;   // 正在飞往背包的数量（先占坑，防止索引撞车）
    private _pickupTimer: number = 0;

    update(dt: number) {
        this._syncRotationIfChanged();
        if (!this.player) return;
        if (this.externalTransport) return;   // 传送带接管，玩家不捡

        const dist = Vec3.distance(this.player.node.worldPosition, this.node.worldPosition);
        if (dist <= this.pickupRange && this._items.length > 0) {
            this._pickupTimer += dt;
            if (this._pickupTimer >= this.pickupInterval) {
                this._pickupTimer = 0;
                this._pickupOne();
            }
        } else {
            this._pickupTimer = 0;
        }
    }

    /** 机器产出物品时调用（Machine 在用，保持原名） */
    receivePlank(plank: Node, startWorldPos: Vec3, onLanded?: () => void) {
        this._flyIn(plank, startWorldPos, onLanded);
    }

    private _pickupOne() {
        if (this._items.length === 0) return;

        const top = this._items[this._items.length - 1];
        if (!this.player.backpack.canAdd(top)) return;   // 背上已有两种物品，且不是这种

        const item = this._items.pop()!;
        this._picking++;

        const backpack = this.player.backpack;
        const targetIndex = backpack.count + this._picking - 1;

        const carryRot = this.carryRotation;
        const carryPoint = this.player.carryPoint;
        const carryWorld = new Vec3();
        carryPoint.getWorldPosition(carryWorld);

        tween(item)
            .to(0.2, { worldPosition: carryWorld }, { easing: 'quadOut' })
            .call(() => {
                item.setParent(carryPoint);
                item.setPosition(0, targetIndex * 0.35, -0.4);
                item.setRotationFromEuler(carryRot.x, carryRot.y, carryRot.z);
                backpack.addWood(item);
                this._picking--;
            })
            .start();
    }

    /** 布局：沿 Z 排 4 个一层 */
    protected _layoutPos(index: number): Vec3 {
        const perLayer = 4;
        const cols = 4;
        const spacing = 0.35;
        const startZ = -((cols - 1) * spacing) / 2;

        const layer = Math.floor(index / perLayer);
        const col = (index % perLayer) % cols;

        return this._rotateY(0, layer * spacing, startZ + col * spacing);
    }
}
