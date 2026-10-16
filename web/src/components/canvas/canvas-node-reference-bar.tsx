import { FileText, Image as ImageIcon, Music2, Plus, Puzzle, Upload, Video, X } from "lucide-react";
import { Dropdown, message, Popover, type MenuProps } from "antd";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { getGroupResourceNodes, isCanvasReferenceNode } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasNodeReferenceBar({
    nodeId,
    nodes,
    connectedNodes,
    onDisconnect,
    onStartSelection,
    onUpload,
    onDropFiles,
    onAddEmpty,
}: {
    nodeId: string;
    nodes: CanvasNodeData[];
    connectedNodes: CanvasNodeData[];
    onDisconnect?: (fromNodeId: string, toNodeId: string) => void;
    onStartSelection?: (nodeId: string) => void;
    onUpload?: (nodeId: string) => void;
    onDropFiles?: (nodeId: string, files: File[]) => void;
    onAddEmpty?: (nodeId: string) => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [menuOpen, setMenuOpen] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const references = connectedNodes.flatMap((sourceNode) => (sourceNode.type === CanvasNodeType.Group ? getGroupResourceNodes(sourceNode.id, nodes) : [sourceNode]).map((node) => ({ node, sourceNodeId: sourceNode.id })));

    // Check if there are candidate nodes available on canvas for selection
    const hasAvailableCandidates = useMemo(() => {
        const connectedSet = new Set(connectedNodes.map((n) => n.id));
        return nodes.some((n) => n.id !== nodeId && !connectedSet.has(n.id) && isCanvasReferenceNode(n, nodes));
    }, [connectedNodes, nodeId, nodes]);

    const handleStartSelection = () => {
        setMenuOpen(false);
        if (!hasAvailableCandidates) {
            message.info(t("canvas.references.noAvailable"));
            return;
        }
        onStartSelection?.(nodeId);
    };

    const handleDropFiles = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return;
        onDropFiles?.(nodeId, files);
    };

    const menuItems: MenuProps["items"] = [
        {
            key: "upload",
            icon: <Upload className="size-4" />,
            label: t("canvas.references.upload"),
            onClick: () => {
                setMenuOpen(false);
                onUpload?.(nodeId);
            },
        },
        {
            key: "create-empty",
            icon: <ImageIcon className="size-4" />,
            label: t("canvas.references.createEmpty"),
            onClick: () => {
                setMenuOpen(false);
                onAddEmpty?.(nodeId);
            },
        },
        {
            type: "divider",
        },
        {
            key: "select-canvas",
            icon: <Plus className="size-4" />,
            label: t("canvas.references.select"),
            onClick: handleStartSelection,
        },
    ];

    return (
        <div
            className="mb-2 transition-colors rounded-xl"
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
            }}
            onDrop={handleDropFiles}
        >
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium" style={{ color: theme.node.muted }}>
                <span>{t("canvas.references.title")}</span>
                {isDragOver ? <span className="text-primary font-normal">{t("canvas.references.upload")}</span> : null}
            </div>
            <div className="thin-scrollbar flex min-h-12 gap-2 overflow-x-auto pb-1">
                {references.map(({ node, sourceNodeId }) => <ReferenceItem key={`${sourceNodeId}:${node.id}`} node={node} onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />)}
                <Dropdown
                    menu={{ items: menuItems }}
                    trigger={["click"]}
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    placement="bottomLeft"
                >
                    <button
                        type="button"
                        className="grid size-12 shrink-0 place-items-center rounded-xl border bg-transparent transition hover:opacity-70"
                        style={{
                            borderColor: isDragOver ? theme.node.activeStroke : theme.toolbar.border,
                            color: isDragOver ? theme.node.activeStroke : theme.node.muted,
                            background: isDragOver ? theme.toolbar.activeBg : "transparent",
                        }}
                        title={t("canvas.references.upload")}
                        onClick={() => {
                            // If user clicks, open dropdown menu
                        }}
                    >
                        <Plus className="size-4" />
                    </button>
                </Dropdown>
            </div>
        </div>
    );
}

function ReferenceItem({ node, onRemove }: { node: CanvasNodeData; onRemove: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const Icon = resource?.kind === "image" || node.type === CanvasNodeType.Image ? ImageIcon : resource?.kind === "video" || node.type === CanvasNodeType.Video ? Video : resource?.kind === "audio" || node.type === CanvasNodeType.Audio ? Music2 : resource?.kind === "text" || node.type === CanvasNodeType.Text ? FileText : Puzzle;
    return (
        <Popover placement="topLeft" mouseEnterDelay={0.15} content={<ReferencePreview node={node} content={content} />}>
            <div className="group relative grid size-12 shrink-0 place-items-center rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border }}>
                <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
                    {(resource?.kind === "image" || node.type === CanvasNodeType.Image) && thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover" /> : (resource?.kind === "video" || node.type === CanvasNodeType.Video) && content ? <video src={content} className="size-full object-cover" muted /> : <Icon className="size-4 opacity-65" />}
                </span>
                <button type="button" className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} aria-label={t("canvas.references.disconnect")} title={t("canvas.references.disconnect")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}><X className="size-3" /></button>
            </div>
        </Popover>
    );
}

function ReferencePreview({ node, content }: { node: CanvasNodeData; content?: string }) {
    const { t } = useTranslation();
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if ((resource?.kind === "image" || node.type === CanvasNodeType.Image) && content) return <img src={content} alt={node.title} className="max-h-52 w-72 rounded-lg object-contain" />;
    if ((resource?.kind === "video" || node.type === CanvasNodeType.Video) && content) return <video src={content} className="max-h-52 w-72 rounded-lg" muted controls />;
    if ((resource?.kind === "audio" || node.type === CanvasNodeType.Audio) && content) return <audio src={content} className="w-72" controls />;
    return <div className="max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{resource?.text || node.metadata?.content || node.metadata?.prompt || node.title || t("canvas.references.empty")}</div>;
}
