'use client'

import React, { useState, useEffect } from 'react';
import { useForm, FormProvider as RHFFormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  Textarea,
  Button,
  Badge,
} from '@shared/ui';
import { X, Hexagon, Loader2 } from 'lucide-react';
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config';
import { useUIStore } from '@/features/shared/store';

// 动态加载的蜂群类型
interface SwarmOption {
  id: string;
  name: string;
  description: string | null;
  agents: string[];
  skillsCount: number;
  accent: string;
}

// 表单 schema
const formSchema = z.object({
  name: z.string().min(1, { message: '项目名称是必填项。' }),
  description: z.string().optional(),
  repoPath: z.string().url({ message: 'Git 仓库地址必须是一个有效的 URL。' }),
  swarmId: z.string().min(1, { message: '请选择一个默认蜂群。' }),
  swarmName: z.string().optional(),
  setupScript: z.string().optional(),
  filesToCopy: z.array(z.string()).optional(),
});

// 扩展的表单输出类型，包含蜂群信息
export interface CreateProjectFormValues extends z.infer<typeof formSchema> {
  swarmId: string;
  swarmName: string;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateProjectFormValues) => void;
}

export { CreateProjectModal };

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      repoPath: '',
      swarmId: '',
      swarmName: '',
      setupScript: '',
      filesToCopy: [],
    },
  });

  // 蜂群选择状态
  const [swarms, setSwarms] = useState<SwarmOption[]>([]);
  const [isLoadingSwarms, setIsLoadingSwarms] = useState(false);
  const [selectedSwarm, setSelectedSwarm] = useState<SwarmOption | null>(null);
  const [showSwarmSuggestions, setShowSwarmSuggestions] = useState(false);
  const [swarmInput, setSwarmInput] = useState('');

  // 加载蜂群列表
  useEffect(() => {
    if (!isOpen) return;
    
    setIsLoadingSwarms(true);
    fetch(resolveHttpUrl('/api/swarms'))
      .then((res) => res.json())
      .then((data: SwarmOption[]) => {
        setSwarms(data);
        // 默认选择第一个蜂群
        if (data.length > 0 && !selectedSwarm) {
          handleSelectSwarm(data[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load swarms:', err);
      })
      .finally(() => {
        setIsLoadingSwarms(false);
      });
  }, [isOpen]);

  // 获取蜂群的 accent 颜色
  const getAccentColor = (accent: string) => {
    const colors: Record<string, string> = {
      amber: 'bg-amber-100 text-amber-700 border-amber-200',
      violet: 'bg-violet-100 text-violet-700 border-violet-200',
      teal: 'bg-teal-100 text-teal-700 border-teal-200',
      rose: 'bg-rose-100 text-rose-700 border-rose-200',
      blue: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return colors[accent] || colors.amber;
  };

  // 选择蜂群
  const handleSelectSwarm = (swarm: SwarmOption) => {
    setSelectedSwarm(swarm);
    setSwarmInput(swarm.name);
    setShowSwarmSuggestions(false);
    form.setValue('swarmId', swarm.id, { shouldValidate: true });
    form.setValue('swarmName', swarm.name, { shouldValidate: true });
  };

  // 移除已选蜂群
  const handleRemoveSwarm = () => {
    setSelectedSwarm(null);
    setSwarmInput('');
    form.setValue('swarmId', '', { shouldValidate: true });
    form.setValue('swarmName', '', { shouldValidate: true });
  };

  // 过滤蜂群列表
  const filteredSwarms = swarms.filter((s) =>
    s.name.toLowerCase().includes(swarmInput.toLowerCase())
  );

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    onCreate({
      ...values,
      swarmId: values.swarmId,
      swarmName: selectedSwarm?.name || values.swarmName || '',
    });
    onClose();
  };

  const handleAddFileToCopy = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      const fileName = input.value.trim();
      if (fileName && !form.getValues('filesToCopy')?.includes(fileName)) {
        form.setValue('filesToCopy', [...(form.getValues('filesToCopy') || []), fileName], { shouldValidate: true });
        input.value = '';
      }
    }
  };

  const handleRemoveFileToCopy = (fileName: string) => {
    form.setValue(
      'filesToCopy',
      form.getValues('filesToCopy')?.filter((file) => file !== fileName),
      { shouldValidate: true }
    );
  };

  // 关闭时重置
  useEffect(() => {
    if (!isOpen) {
      form.reset();
      setSelectedSwarm(null);
      setSwarmInput('');
      setShowSwarmSuggestions(false);
    }
  }, [isOpen, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[600px] p-0">
        <DialogHeader className="px-6 py-6 md:px-8 md:py-6 border-b border-gray-100">
          <DialogTitle className="text-xl font-semibold text-gray-900">{txt('创建新项目', 'Create New Project')}</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogHeader>
        {/* @ts-expect-error react-hook-form FormProvider type issue */}
        <RHFFormProvider {...form}>
          <Form>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 p-8">
              <FormField name="name">
                {({ field }) => (
                  <div className="space-y-1.5">
                    <FormLabel className="block text-sm font-medium text-gray-700">
                      {txt('项目名称', 'Project Name')} <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <input
                        placeholder={txt('请输入项目名称', 'Enter project name')}
                        className={`w-full h-[46px] rounded-lg border border-gray-300 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 ${
                          form.formState.errors.name ? 'border-red-300' : ''
                        }`}
                        name={field.name}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        value={(field.value as string) ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="description">
                {({ field }) => (
                  <div className="space-y-1.5">
                    <FormLabel className="block text-sm font-medium text-gray-700">{txt('项目描述', 'Project Description')}</FormLabel>
                    <FormControl>
                      <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                        <div className="flex items-center gap-1 p-1.5 bg-gray-50 border-b border-gray-200">
                          <Button variant="ghost" size="sm" className="p-1.5 hover:bg-white rounded transition-colors text-gray-600">
                            <span className="material-symbols-outlined text-xl">format_bold</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="p-1.5 hover:bg-white rounded transition-colors text-gray-600">
                            <span className="material-symbols-outlined text-xl">format_italic</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="p-1.5 hover:bg-white rounded transition-colors text-gray-600">
                            <span className="material-symbols-outlined text-xl">image</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="p-1.5 hover:bg-white rounded transition-colors text-gray-600">
                            <span className="material-symbols-outlined text-xl">code</span>
                          </Button>
                        </div>
                        <Textarea
                          placeholder={txt('关于该项目的简要说明...', 'Short description of this project...')}
                          rows={3}
                          className="w-full border-none focus:ring-0 p-3 text-sm placeholder-gray-400 resize-none"
                          name={field.name}
                          onChange={(event) => form.setValue('description', event.target.value, { shouldValidate: true })}
                          onBlur={() => form.trigger('description')}
                          value={(field.value as string) ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="repoPath">
                {({ field }) => (
                  <div className="space-y-1.5">
                    <FormLabel className="block text-sm font-medium text-gray-700">
                      {txt('Git 仓库地址', 'Git Repository URL')} <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <input
                          placeholder="https://github.com/user/repo.git"
                          className={`w-full h-[46px] rounded-lg border border-gray-300 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 ${
                            form.formState.errors.repoPath ? 'border-red-300' : ''
                          }`}
                          name={field.name}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          value={(field.value as string) ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              {/* 蜂群选择 - 自定义下拉框 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  {txt('默认蜂群', 'Default Swarm')} <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  {selectedSwarm ? (
                    // 已选蜂群 - 显示 Badge
                    <div className="flex items-center gap-2 p-2.5 border border-gray-300 rounded-lg bg-white min-h-[46px]">
                      <Badge className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border ${getAccentColor(selectedSwarm.accent)}`}>
                        <Hexagon className="h-3 w-3" />
                        <span>{selectedSwarm.name}</span>
                        <button
                          type="button"
                          onClick={handleRemoveSwarm}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    </div>
                  ) : (
                    // 输入框
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={isLoadingSwarms ? txt("加载蜂群...", "Loading swarms...") : txt("选择蜂群，输入 / 查看所有可用蜂群...", "Select swarm, type / to view all...")}
                        className={`w-full h-[46px] rounded-lg border bg-white px-3 pr-10 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-400 ${
                          form.formState.errors.swarmId ? 'border-red-300' : 'border-gray-300'
                        }`}
                        value={swarmInput}
                        onChange={(e) => {
                          setSwarmInput(e.target.value);
                          setShowSwarmSuggestions(true);
                        }}
                        onFocus={() => setShowSwarmSuggestions(true)}
                        disabled={isLoadingSwarms || swarms.length === 0}
                      />
                      {isLoadingSwarms && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                  )}

                  {/* 蜂群下拉建议 */}
                  {showSwarmSuggestions && !selectedSwarm && swarms.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-[240px] overflow-y-auto">
                      {filteredSwarms.length === 0 ? (
                        <div className="px-3 py-2.5 text-sm text-gray-500">
                          {txt('未找到匹配的蜂群', 'No matching swarm found')}
                        </div>
                      ) : (
                        filteredSwarms.map((swarm) => (
                          <button
                            key={swarm.id}
                            type="button"
                            onClick={() => handleSelectSwarm(swarm)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getAccentColor(swarm.accent)}`}>
                              <Hexagon className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="font-medium text-sm text-gray-900">
                                {swarm.name}
                              </span>
                              <span className="text-xs text-gray-500 truncate">
                                {swarm.agents.length} Agents · {swarm.skillsCount} Skills
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {swarms.length === 0 && !isLoadingSwarms && (
                  <p className="text-sm text-amber-600">
                    {txt('暂无可用蜂群，请先创建蜂群', 'No available swarms. Please create one first')}
                  </p>
                )}
                {form.formState.errors.swarmId && (
                  <p className="text-sm text-red-500">{form.formState.errors.swarmId.message}</p>
                )}
              </div>

              <FormField name="setupScript">
                {({ field }) => (
                  <div className="space-y-1.5">
                    <FormLabel className="block text-sm font-medium text-gray-700">{txt('安装脚本', 'Setup Script')}</FormLabel>
                    <FormControl>
                      <div className="relative flex items-start bg-[#1E1E1E] rounded-lg p-3 font-mono text-sm group">
                        <span className="text-gray-500 select-none mr-3">#</span>
                        <Textarea
                          placeholder="sh install.sh"
                          rows={2}
                          className="w-full bg-transparent border-none p-0 text-green-400 focus:ring-0 resize-none font-mono placeholder-gray-600"
                          name={field.name}
                          onChange={(event) => form.setValue('setupScript', event.target.value, { shouldValidate: true })}
                          onBlur={() => form.trigger('setupScript')}
                          value={(field.value as string) ?? ''}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormField>

              <FormField name="filesToCopy">
                {({ field }) => (
                  (() => {
                    const filesToCopy = Array.isArray(field.value) ? field.value : []
                    return (
                  <div className="space-y-1.5">
                    <FormLabel className="block text-sm font-medium text-gray-700">{txt('复制文件列表', 'Files to Copy')}</FormLabel>
                    <FormControl>
                      <div className="flex flex-wrap items-center gap-2 p-2.5 border border-gray-300 rounded-lg min-h-[46px] bg-white">
                        {filesToCopy.map((fileName) => (
                          <Badge key={fileName} variant="secondary" className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded text-xs text-gray-700 border border-gray-200">
                            {fileName}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-auto w-auto p-0 hover:text-red-500 flex items-center"
                              onClick={() => handleRemoveFileToCopy(fileName)}
                            >
                              <X className="h-3 w-3" />
                              <span className="sr-only">{txt(`移除 ${fileName}`, `Remove ${fileName}`)}</span>
                            </Button>
                          </Badge>
                        ))}
                        <input
                          className="flex-1 border-none focus:ring-0 p-0 text-sm placeholder-gray-400 min-w-[120px]"
                          placeholder={txt('输入文件名并按回车...', 'Enter file name and press Enter...')}
                          onKeyDown={handleAddFileToCopy}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </div>
                    )
                  })()
                )}
              </FormField>

              <DialogFooter className="flex justify-end gap-4 border-t border-gray-100 px-8 py-6 -mx-8 -mb-8">
                <Button type="button" variant="ghost" onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  {txt('取消', 'Cancel')}
                </Button>
                <Button type="submit" className="px-8 py-2.5 text-sm font-semibold text-white bg-[#F59E0B] hover:bg-[#D97706] rounded-lg shadow-sm shadow-amber-200 transition-all">
                  {txt('创建项目', 'Create Project')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </RHFFormProvider>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectModal;
