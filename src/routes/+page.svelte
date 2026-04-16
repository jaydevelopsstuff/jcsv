<script lang="ts">
    const ROW_HEIGHT = 36;
    const OVERSCAN = 8;

    import { CSVFile, DataEngine, type Row } from "$lib/index.svelte";
    import { Button } from "$lib/components/ui/button";
    import * as ContextMenu from "$lib/components/ui/context-menu";
    import * as NativeSelect from "$lib/components/ui/native-select";
    import * as Sheet from "$lib/components/ui/sheet";
    import { Input } from "$lib/components/ui/input";
    import { Textarea } from "$lib/components/ui/textarea";
    import { downloadTextFile } from "$lib/utils";
    import { SvelteMap } from "svelte/reactivity";
    import { onMount } from "svelte";
    import MonacoEditor from "$lib/components/MonacoEditor.svelte";
    import { cn } from "$lib/utils/cn";
    import FloatingCellEditor, {
        type StartEditingCellFn,
    } from "$lib/components/FloatingCellEditor.svelte";

    let getEditorValue: () => string;
    let startEditingCell: StartEditingCellFn;

    let fileName = $state("");
    let ready = $state(false);

    let dataEngine = $state<DataEngine>();
    let cachedRows = $state<Row[]>([]);

    let startIndex = $state(0);
    let endIndex = $state(0);

    let renderedStartIndex = $state(0);

    let width = $state<number>();
    let scrollContainer: HTMLDivElement;

    let editMode = $state<"pre" | "post">("post");
    let addingTransformRow = $state<string | null>(null);

    async function refreshRowCache(startIdx = startIndex, endIdx = endIndex) {
        cachedRows = await dataEngine!.getProcessedRows(startIdx, endIdx);
        renderedStartIndex = startIdx;
    }

    async function onCellEditFinish(
        rowId: string,
        colHeaderId: string,
        newCellValue: string,
    ) {
        dataEngine!.addEdit(rowId, colHeaderId, "pre", newCellValue);
        console.log([...dataEngine!.preTransformEdits]);
        await refreshRowCache();
    }
</script>

<Sheet.Root
    bind:open={
        () => addingTransformRow !== null,
        (open) => {
            if (!open) addingTransformRow = null;
        }
    }
>
    <Sheet.Content class="min-w-2xl">
        <Sheet.Header>
            <Sheet.Title>Add Transform</Sheet.Title>
        </Sheet.Header>
        <MonacoEditor bind:getValue={getEditorValue} />
        <Sheet.Footer>
            <Button
                onclick={async () => {
                    dataEngine!.addColumnTransformToPipeline(
                        addingTransformRow!,
                        getEditorValue(),
                    );
                    await refreshRowCache();
                    addingTransformRow = null;
                }}
            >
                Add Transform
            </Button>
        </Sheet.Footer>
    </Sheet.Content>
</Sheet.Root>

<div class="flex flex-col h-screen px-1">
    {#if dataEngine && ready}
        <div class="flex justify-between py-1">
            <span>{fileName}</span>
            <div class="flex gap-1">
                <NativeSelect.Root bind:value={editMode}>
                    <NativeSelect.Option value="pre">Pre</NativeSelect.Option>
                    <NativeSelect.Option value="post">Post</NativeSelect.Option>
                </NativeSelect.Root>
                <Button
                    onclick={async () => {
                        downloadTextFile(
                            await dataEngine!.exportWithChanges(),
                            "exported.csv",
                        );
                    }}
                >
                    Export
                </Button>
            </div>
        </div>
        <div class="flex flex-col grow overflow-y-hidden overflow-x-auto">
            <div class="flex w-fit h-12" bind:offsetWidth={width}>
                <div class="w-10 border-b"></div>
                {#each dataEngine.dataSource.columnHeaders.entries() as [id, name], i}
                    <ContextMenu.Root>
                        <ContextMenu.Trigger
                            class={cn(
                                "w-72 min-w-72 p-1 border-r border-t border-b",
                                i === 0 && "border-l",
                            )}
                        >
                            {name}
                        </ContextMenu.Trigger>
                        <ContextMenu.Content class="w-52">
                            <ContextMenu.Sub>
                                <ContextMenu.SubTrigger>
                                    Transforms
                                </ContextMenu.SubTrigger>
                                <ContextMenu.SubContent>
                                    {#each dataEngine.columnTransformPipelines.get(id)?.pipeline as transform, i}
                                        <ContextMenu.Item>
                                            Transform #{i + 1}
                                        </ContextMenu.Item>
                                    {/each}
                                    {#if dataEngine.columnTransformPipelines.get(id)?.pipeline.length || 0 > 0}
                                        <ContextMenu.Separator />
                                    {/if}
                                    <ContextMenu.Item
                                        onclick={() =>
                                            (addingTransformRow = id)}
                                    >
                                        Add Transform
                                    </ContextMenu.Item>
                                </ContextMenu.SubContent>
                            </ContextMenu.Sub>
                        </ContextMenu.Content>
                    </ContextMenu.Root>
                {/each}
            </div>
            <div
                onscroll={async (e) => {
                    startIndex = Math.max(
                        Math.floor(e.currentTarget.scrollTop / ROW_HEIGHT) -
                            OVERSCAN,
                        0,
                    );
                    endIndex = Math.min(
                        Math.ceil(
                            e.currentTarget.scrollTop / ROW_HEIGHT +
                                e.currentTarget.offsetHeight / ROW_HEIGHT +
                                OVERSCAN,
                        ),
                        dataEngine!.rowCount,
                    );
                    await refreshRowCache();
                }}
                class="overflow-y-scroll overflow-x-visible w-fit pr-4"
                style={`width: ${width}px;`}
            >
                <div
                    bind:this={scrollContainer}
                    class="relative min-w-max"
                    style={`height: ${dataEngine.rowCount * ROW_HEIGHT}px;`}
                >
                    <FloatingCellEditor
                        bind:startEditing={startEditingCell}
                        onEditFinish={onCellEditFinish}
                    />
                    <div
                        class="absolute min-w-max"
                        style={`top: ${renderedStartIndex * ROW_HEIGHT}px;`}
                    >
                        {#each cachedRows as row, rowIdx (row.id)}
                            <div class="flex h-9">
                                <div
                                    class={cn(
                                        "w-10 font-mono p-1 border-[0.5px] border-l",
                                        row?.id.startsWith("addedRow:") &&
                                            "border-l-green-500",
                                    )}
                                >
                                    {rowIdx + renderedStartIndex + 1}
                                </div>
                                {#each row.columns as col, colI (col.headerId)}
                                    <div
                                        class={cn(
                                            "cursor-default select-none w-72 min-w-72 overflow-hidden whitespace-nowrap font-mono border-[0.5px] p-1 flex items-center",
                                            colI === 0 && "border-l",
                                        )}
                                        ondblclick={(e) => {
                                            startEditingCell(
                                                row!.id,
                                                col.headerId,
                                                col.value,
                                                e.currentTarget.getBoundingClientRect(),
                                                scrollContainer.getBoundingClientRect(),
                                            );
                                        }}
                                    >
                                        {col.value}
                                    </div>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div
            class="grow border-dashed mx-1 my-2 border justify-center flex items-center rounded-xl"
        >
            <label for="file-input">Drop CSV File Here</label>
            <Input
                type="file"
                id="file-input"
                class="absolute opacity-0 w-full h-full"
                onchange={async (e) => {
                    fileName = e.currentTarget.files![0].name;
                    dataEngine = new DataEngine(
                        new CSVFile(e.currentTarget.files![0]),
                    );
                    await dataEngine.init();
                    startIndex = 0;
                    endIndex = Math.min(
                        Math.ceil(window.innerHeight / ROW_HEIGHT + OVERSCAN),
                        dataEngine.rowCount,
                    );
                    await refreshRowCache();
                    ready = true;
                }}
            />
        </div>
    {/if}
</div>
