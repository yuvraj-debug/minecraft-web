import { BlockType, BLOCK_DEFS } from '../world/Block.ts';
import { TextureAtlas } from '../world/TextureAtlas.ts';

export class Hotbar {
  public slots: BlockType[] = [
    BlockType.GRASS,
    BlockType.COBBLESTONE,
    BlockType.OAK_WOOD,
    BlockType.PLANKS,
    BlockType.BRICKS,
    BlockType.GLASS,
    BlockType.DIAMOND_ORE,
    BlockType.TORCH,
    BlockType.SAND
  ];

  public selectedSlot = 0;
  private atlas: TextureAtlas;
  private container: HTMLElement;
  private nameLabel: HTMLElement;
  private onSelectCallback?: (block: BlockType) => void;

  constructor(atlas: TextureAtlas, onSelect?: (block: BlockType) => void) {
    this.atlas = atlas;
    this.onSelectCallback = onSelect;
    this.container = document.getElementById('hotbar')!;
    this.nameLabel = document.getElementById('selected-block-name')!;

    this.render();
    this.setupListeners();
  }

  public getSelectedBlock(): BlockType {
    return this.slots[this.selectedSlot];
  }

  public setSlot(slotIndex: number, block: BlockType): void {
    if (slotIndex < 0 || slotIndex >= 9) return;
    this.slots[slotIndex] = block;
    this.render();
    if (this.selectedSlot === slotIndex && this.onSelectCallback) {
      this.onSelectCallback(block);
    }
  }

  public selectSlot(index: number): void {
    if (index < 0 || index >= 9) return;
    this.selectedSlot = index;
    this.updateActiveSlotUI();
    if (this.onSelectCallback) {
      this.onSelectCallback(this.getSelectedBlock());
    }
  }

  private updateActiveSlotUI(): void {
    const slotElements = this.container.querySelectorAll('.hotbar-slot');
    slotElements.forEach((el, idx) => {
      if (idx === this.selectedSlot) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    const block = this.getSelectedBlock();
    const def = BLOCK_DEFS[block];
    if (def) {
      this.nameLabel.textContent = def.name;
    }
  }

  private render(): void {
    this.container.innerHTML = '';

    this.slots.forEach((blockType, idx) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = `hotbar-slot ${idx === this.selectedSlot ? 'active' : ''}`;

      const numSpan = document.createElement('span');
      numSpan.className = 'slot-number';
      numSpan.textContent = `${idx + 1}`;
      slotDiv.appendChild(numSpan);

      const def = BLOCK_DEFS[blockType];
      if (def && blockType !== BlockType.AIR) {
        const icon = document.createElement('img');
        icon.src = this.atlas.getIconDataURL(def.textures.side || def.textures.top);
        icon.alt = def.name;
        slotDiv.appendChild(icon);
      }

      slotDiv.addEventListener('click', () => {
        this.selectSlot(idx);
      });

      this.container.appendChild(slotDiv);
    });

    const block = this.getSelectedBlock();
    const def = BLOCK_DEFS[block];
    if (def) {
      this.nameLabel.textContent = def.name;
    }
  }

  private setupListeners(): void {
    // Number keys 1-9
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''), 10);
        if (digit >= 1 && digit <= 9) {
          this.selectSlot(digit - 1);
        }
      }
    });

    // Mouse wheel scroll through hotbar
    window.addEventListener('wheel', (e) => {
      // Only scroll when not in inventory or pause menu
      const inv = document.getElementById('inventory-modal');
      const pause = document.getElementById('pause-menu');
      if (inv?.classList.contains('hidden') && pause?.classList.contains('hidden')) {
        if (e.deltaY > 0) {
          this.selectSlot((this.selectedSlot + 1) % 9);
        } else if (e.deltaY < 0) {
          this.selectSlot((this.selectedSlot - 1 + 9) % 9);
        }
      }
    });
  }
}
