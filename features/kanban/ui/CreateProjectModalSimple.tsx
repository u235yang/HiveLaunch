'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '@/features/shared/store'

const SWARM_OPTIONS = [
  { value: 'react-dev', zhLabel: 'React 开发蜂群', enLabel: 'React Dev Swarm' },
  { value: 'node-backend', zhLabel: 'Node.js 后端蜂群', enLabel: 'Node.js Backend Swarm' },
]

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: any) => void
}

export default function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    repoPath: '',
    defaultAgent: '',
  })

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onCreate(formData)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">{txt('创建新项目', 'Create New Project')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label={txt('关闭', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {txt('项目名称', 'Project Name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder={txt('请输入项目名称', 'Enter project name')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{txt('项目描述', 'Project Description')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder={txt('关于该项目的简要说明...', 'Short description of this project...')}
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {txt('Git 仓库地址', 'Git Repository URL')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.repoPath}
              onChange={(e) => setFormData({ ...formData, repoPath: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="https://github.com/user/repo.git"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {txt('默认蜂群', 'Default Swarm')} <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.defaultAgent}
              onChange={(e) => setFormData({ ...formData, defaultAgent: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="">{txt('选择一个蜂群', 'Select a swarm')}</option>
              {SWARM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {txt(option.zhLabel, option.enLabel)}
                </option>
              ))}
            </select>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              {txt('取消', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors font-medium"
            >
              {txt('创建项目', 'Create Project')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
