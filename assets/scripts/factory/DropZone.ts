import { _decorator, Vec3, tween, CCFloat } from 'cc';
import { Machine } from './Machine';
import { StackZone } from './StackZone';

const { ccclass, property } = _decorator;

/**
 * 放置区：玩家把背上的物品放进来堆叠，再逐个送进机器。
 * 堆叠 / 飞入 / 出栈逻辑都在基类 StackZone，这里只写"玩家放下"和"送机器"。
 */
@ccclass('DropZone')
export class DropZone extends StackZone {

    @property({ type: CCFloat })
    dropRange: number = 2;

    @property({ type: CCFloat })
    dropInterval: number = 0.05;

    @property({ type: Machine })
    machine: Machine = null!;

    @property({ type: CCFloat })
    sendInterval: number = 0.1;

    /** 传送带接管标记：有传送带从这里拉货时，本区不再自己送机器（由 ConveyorBelt 自动设置） */
    public externalTransport: boolean = false;

    private _dropTimer: number = 0;
    private _sendTimer: number = 0;

    update(dt: number) {
        this._syncRotationIfChanged();
        if (!this.player) return;

        const dist = Vec3.distance(this.player.node.worldPosition, this.node.worldPosition);

        if (dist <= this.dropRange && this.player.backpack.count > 0) {
            this._dropTimer += dt;
            if (this._dropTimer >= this.dropInterval) {
                this._dropTimer = 0;
                this._tryDropFromPlayer();
            }
        } else {
            this._dropTimer = 0;
        }

        this._sendTimer += dt;
        if (this._sendTimer >= this.sendInterval) {
            this._sendTimer = 0;
            this._trySendToMachine();
        }
    }

    private _tryDropFromPlayer() {
        const wood = this.player.backpack.takeWood(this.acceptPrefix);
        if (!wood) return;

        const startWorldPos = wood.worldPosition.clone();
        // 起飞时就转到放置区的角度，飞行过程中保持这个朝向
        wood.setRotationFromEuler(this.zoneRotation.x, this.zoneRotation.y, this.zoneRotation.z);
        this._flyIn(wood, startWorldPos);
    }

    private _trySendToMachine() {
        if (this.externalTransport) return;   // 传送带接管了，自己不送
        if (this._items.length === 0) return;
        if (!this.machine) return;

        const wood = this._items.pop()!;
        const isLast = this._items.length === 0;

        const startWorldPos = wood.worldPosition.clone();
        const endPos = this.machine.entryPoint.worldPosition.clone();

        const midPos = new Vec3(
            (startWorldPos.x + endPos.x) / 2,
            Math.max(startWorldPos.y, endPos.y) + 2.5,
            (startWorldPos.z + endPos.z) / 2
        );

        tween(wood)
            .to(0.15, { worldPosition: midPos }, { easing: 'quadOut' })
            .to(0.15, { worldPosition: endPos }, { easing: 'quadIn' })
            .call(() => {
                this.machine.receiveWood(wood, isLast);
            })
            .start();
    }

    /** 布局：沿 X 排 4 个一层 */
    protected _layoutPos(index: number): Vec3 {
        const perLayer = 4;
        const cols = 4;
        const spacing = 0.35;
        const startX = -0.5;

        const layer = Math.floor(index / perLayer);
        const col = (index % perLayer) % cols;

        return this._rotateY(startX + col * spacing, layer * spacing, 0);
    }
}
