"use client";

import { useState } from "react";
import { UseFormWatch, UseFormSetValue } from "react-hook-form";

interface TagsFieldProps {
    label?: string;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
    path: string;
    placeholder?: string;
    onAdd?: (value: string) => void;
    candidateTags?: string[];
}

export function TagsField({ label = "Tags", watch, setValue, path, placeholder, onAdd, candidateTags = [] }: TagsFieldProps) {
    const rawTags = watch(path);
    const tags = Array.isArray(rawTags) ? rawTags : [];
    const selectedTags = new Set(tags);
    const availableCandidates = candidateTags.filter((tag) => !selectedTags.has(tag));
    const [isAdding, setIsAdding] = useState(false);
    const [newTagValue, setNewTagValue] = useState("");

    const handleRemove = (tagToRemove: string) => {
        setValue(path, tags.filter((t: string) => t !== tagToRemove), { shouldDirty: true });
    };

    const handleAddTag = (value: string) => {
        if (!value.trim() || selectedTags.has(value.trim())) {
            return;
        }
        const nextValue = value.trim();
        if (onAdd) {
            onAdd(nextValue);
        } else {
            setValue(path, [...tags, nextValue], { shouldDirty: true });
        }
    };

    const submitNewTag = () => {
        if (!newTagValue.trim()) {
            return;
        }
        handleAddTag(newTagValue);
        setNewTagValue("");
        setIsAdding(false);
    };

    return (
        <div className="flex items-start gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0 pt-1">
                {label}
            </label>
            <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag: string) => (
                        <span
                            key={tag}
                            className="px-2 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-orange-700 dark:text-primary flex items-center gap-1"
                        >
                            {tag}
                            <button type="button" onClick={() => handleRemove(tag)} className="hover:text-red-500 ml-1">
                                ×
                            </button>
                        </span>
                    ))}
                    {tags.length === 0 && <span className="text-xs text-slate-400">暂无</span>}
                </div>
                {candidateTags.length > 0 ? (
                    <div className="space-y-2">
                        {availableCandidates.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {availableCandidates.map((candidate) => (
                                    <button
                                        key={candidate}
                                        type="button"
                                        onClick={() => handleAddTag(candidate)}
                                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:border-primary/40 hover:text-primary"
                                    >
                                        + {candidate}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs text-slate-400">无可选项</span>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {isAdding ? (
                            <div className="flex items-center gap-2">
                                <input
                                    value={newTagValue}
                                    onChange={(e) => setNewTagValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            submitNewTag();
                                        }
                                        if (e.key === "Escape") {
                                            setIsAdding(false);
                                            setNewTagValue("");
                                        }
                                    }}
                                    className="h-7 flex-1 rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    placeholder={placeholder || "输入后按回车"}
                                    autoFocus
                                />
                                <button type="button" onClick={submitNewTag} className="text-xs text-primary hover:underline">
                                    添加
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAdding(false);
                                        setNewTagValue("");
                                    }}
                                    className="text-xs text-slate-500 hover:underline"
                                >
                                    取消
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setIsAdding(true)} className="text-xs text-primary hover:underline">
                                + 添加
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
