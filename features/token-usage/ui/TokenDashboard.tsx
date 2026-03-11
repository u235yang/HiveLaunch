interface TokenDashboardTexts {
  title: string
  today: string
  week: string
  month: string
  total: string
  comingSoon: string
}

const defaultTexts: TokenDashboardTexts = {
  title: 'Token 使用统计',
  today: '今日使用',
  week: '本周使用',
  month: '本月使用',
  total: '总计使用',
  comingSoon: 'Token 统计功能开发中...',
}

interface TokenDashboardProps {
  texts?: TokenDashboardTexts
}

export function TokenDashboard({ texts = defaultTexts }: TokenDashboardProps) {

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl md:text-2xl font-bold mb-6">{texts.title}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">{texts.today}</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">{texts.week}</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">{texts.month}</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">{texts.total}</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>
      <p className="text-center text-gray-400 mt-12 text-sm">{texts.comingSoon}</p>
    </div>
  )
}
