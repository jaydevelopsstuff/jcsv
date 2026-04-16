<script lang="ts">
    import { cn } from "$lib/utils/cn";

    export type StartEditingCellFn = (
        rowId: string,
        colHeaderId: string,
        cellValue: string,
        cellBoundingRect: DOMRect,
        containerBoundingRect: DOMRect,
    ) => void;

    type FloatingCellEditorProps = {
        startEditing: StartEditingCellFn;
        onEditCancel?: (newCellValue: string) => void;
        onEditFinish: (
            rowId: string,
            colHeaderId: string,
            newCellValue: string,
        ) => Promise<void>;
    };

    let {
        startEditing = $bindable(),
        onEditCancel = () => {},
        onEditFinish,
    }: FloatingCellEditorProps = $props();

    let element: HTMLInputElement;

    let visible = $state(false);
    let value = $state("");
    let position = $state<{ x: number; y: number }>({ x: 0, y: 0 });
    let size = $state<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    let rowId: string, colHeaderId: string;
    startEditing = (
        pRowId,
        pColHeaderId,
        cellValue,
        cellBoundingRect,
        containerBoundingRect,
    ) => {
        value = cellValue;
        position = {
            x: cellBoundingRect.left - containerBoundingRect.left,
            y: cellBoundingRect.top - containerBoundingRect.top,
        };
        size = {
            width: cellBoundingRect.width,
            height: cellBoundingRect.height,
        };
        visible = true;
        rowId = pRowId;
        colHeaderId = pColHeaderId;
        requestAnimationFrame(() => element.focus());
    };

    let cancelling = false;
</script>

<input
    bind:this={element}
    class={cn(
        "absolute bg-background z-10 font-mono outline-0 focus:outline-1 outline-white p-1",
        !visible && "hidden",
    )}
    style={`transform: translate(${position.x}px, ${position.y}px); width: ${size.width}px; height: ${size.height}px;`}
    bind:value
    onkeydown={(e) => {
        switch (e.key) {
            case "Enter":
                if (e.shiftKey) break;
                e.preventDefault();
                e.currentTarget.blur();
                break;
            case "Escape":
                cancelling = true;
                e.currentTarget.blur();
                break;
        }
    }}
    onblur={async () => {
        if (!cancelling) await onEditFinish(rowId, colHeaderId, value);
        visible = false;
        cancelling = false;
    }}
    type="text"
/>
