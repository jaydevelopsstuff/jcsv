<script lang="ts">
    import * as monaco from "monaco-editor";
    import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
    import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
    import { onDestroy, onMount } from "svelte";

    let editor: monaco.editor.IStandaloneCodeEditor;
    let editorContainer!: HTMLDivElement;

    let {
        getValue = $bindable(),
        setValue = $bindable(),
    }: { getValue: () => string; setValue?: (value: string) => void } =
        $props();

    getValue = () => editor.getValue();
    setValue = (v) => editor.setValue(v);

    onMount(() => {
        self.MonacoEnvironment = {
            getWorker: (_: any, label: string) => {
                if (["typescript", "javascript"].includes(label))
                    return new tsWorker();
                return new editorWorker();
            },
        };
        monaco.typescript.javascriptDefaults.setEagerModelSync(true);

        editor = monaco.editor.create(editorContainer, {
            value: "(v) => ",
            language: "javascript",
            theme: "vs-dark",
            automaticLayout: true,
        });
    });

    onDestroy(() => {
        editor.dispose();
    });
</script>

<div bind:this={editorContainer} class="grow"></div>
