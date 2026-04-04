
function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[#111]">{children}</strong>
}

function Accent({ children }: { children: React.ReactNode }) {
  return <span className="text-[#1976D2] font-semibold">{children}</span>
}

function Callout({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-[#F5F5F7] px-5 py-4 text-[15px] text-[#555] leading-relaxed">
      <span className="shrink-0 text-[18px]">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

const steps: Array<{
  number: string
  title: string
  content: React.ReactNode
  image: string
}> = [
  {
    number: "01",
    title: "과정 만들기",
    content: (
      <p>상단 메뉴에서 <Accent>나의 과정</Accent>을 눌러 과정을 등록해주세요.</p>
    ),
    image: "/guide/1.png",
  },
  {
    number: "02",
    title: "과정 정보 입력",
    content: (
      <div className="space-y-4">
        <p>코치님이 근무하게 될 <B>날짜와 시간</B>을 입력해주세요. 날짜를 눌러서 근무일을 선택할 수 있어요. 다시 누르면 해제됩니다.</p>
        <Callout icon="💡">교통비, 출장비 등 시급 외 지급 항목이 있다면 <B>비고</B>에 적어주세요. 코치님께 함께 전달됩니다.</Callout>
      </div>
    ),
    image: "/guide/2.png",
  },
  {
    number: "03",
    title: "코치 찾기 + 찜꽁",
    content: (
      <div className="space-y-4">
        <p><Accent>일정</Accent> 메뉴에서 과정을 선택하면, 날짜와 시간에 맞춰 <B>근무 가능한 코치님 목록</B>이 자동으로 표시됩니다.</p>
        <p>원하는 코치님을 <B>체크</B>하고 <Accent>찜꽁</Accent> 버튼을 눌러주세요.</p>
        <p className="text-[15px] text-[#999]">다른 매니저님이 이미 찜꽁 중이라면 진행 단계를 슬쩍 여쭤봐주세요!</p>
      </div>
    ),
    image: "/guide/3.png",
  },
  {
    number: "04",
    title: "코치님께 한마디",
    content: (
      <div className="space-y-4">
        <p><B>함께 전하는 말</B>을 자유롭게 작성해주세요.</p>
        <p className="text-[15px] text-[#999]">바로 섭외가 아니어도 괜찮아요. 코치님과 편하게 소통해보세요!</p>
      </div>
    ),
    image: "/guide/4.png",
  },
  {
    number: "05",
    title: "코치님에게는\n이렇게 보여요",
    content: (
      <p>코치님의 캘린더에 요청이 표시됩니다.</p>
    ),
    image: "/guide/5-1.png",
  },
  {
    number: "",
    title: "",
    content: (
      <div className="space-y-4">
        <p>코치님이 보는 알림 화면입니다!</p>
        <p className="text-[15px] text-[#999]">메일 알림도 곧 지원 예정입니다.</p>
      </div>
    ),
    image: "/guide/5-2.png",
  },
  {
    number: "06",
    title: "확정하기",
    content: (
      <p>코치님이 수락하신 후, 매니저님이 <Accent>찜꽁스테이지</Accent>에서 <B>최종 확정</B>을 눌러주셔야 확정됩니다.</p>
    ),
    image: "/guide/6.png",
  },
  {
    number: "07",
    title: "계약 작성",
    content: (
      <div className="space-y-4">
        <p>확정되면 <B>계약 양식</B>이 자동으로 팝업됩니다. 내용이 맞는지 한 번 더 확인해주세요!</p>
        <p className="text-[15px] text-[#999]">만약 내용에 오류가 있더라도 구글 시트에 붙여넣은 후 수정해주시면 됩니다.</p>
        <Callout icon="📋">계약은 구글 시트를 바탕으로 진행되며, 계약이 진행되어야 코치님이 내역을 확인할 수 있습니다.</Callout>
      </div>
    ),
    image: "/guide/7.png",
  },
  {
    number: "",
    title: "코치 프로필",
    content: (
      <div className="space-y-4">
        <p><Accent>코치 목록</Accent>에서 코치님의 프로필을 확인할 수 있습니다.</p>
        <p>과정을 함께 하며 느끼셨던 점이 있다면 <B>메모</B>에 편하게 적어주세요.</p>
        <Callout icon="🔒">이 사이트는 데이원컴퍼니 직원만 접근할 수 있습니다.</Callout>
      </div>
    ),
    image: "/guide/8.png",
  },
  {
    number: "",
    title: "근무 이력 확인",
    content: (
      <div className="space-y-4">
        <p>최근 6개월간 <B>얼마나 자주 근무하셨는지</B> 그래프로 확인할 수 있습니다.</p>
        <p>코치님이 활동을 중지하신다면, 다른 매니저님들을 위해 꼭 <B>활동 중단</B>을 기록해주세요.</p>
        <Callout icon="📬">복귀 예정월을 남겨주시면 해당 월에 맞추어 메일을 보내드릴 예정입니다.</Callout>
      </div>
    ),
    image: "/guide/9.png",
  },
  {
    number: "",
    title: "별점 + 재섭외 의사",
    content: (
      <div className="space-y-4">
        <p>다른 매니저님들을 위해 함께 일했던 코치님에 대한 <B>별점</B>을 남겨주세요.</p>
        <p>다시 섭외하고 싶은지 <B>재섭외 의사</B>까지 남겨주시면 큰 도움이 됩니다.</p>
      </div>
    ),
    image: "/guide/10.png",
  },
]

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#FBFBFD]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0D47A1] via-[#1565C0] to-[#1E88E5]">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#42A5F5] rounded-full opacity-10 blur-3xl" />
          <div className="absolute bottom-[-30%] left-[-15%] w-[500px] h-[500px] bg-[#1A237E] rounded-full opacity-20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-8 pt-20 pb-16">
          <p className="text-[13px] font-medium text-white/40 tracking-[0.2em] uppercase mb-4">Getting Started</p>
          <h1 className="text-[36px] sm:text-[44px] font-bold text-white tracking-tight leading-[1.15]">
            코치 DB<br />사용 가이드
          </h1>
          <p className="mt-5 text-[17px] text-white/60 leading-relaxed max-w-md">
            과정 등록부터 계약 작성까지,<br />
            전체 과정을 안내해드릴게요.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 max-w-sm">
            <a href="#recruit" className="group relative overflow-hidden rounded-2xl bg-white/[0.08] backdrop-blur-xl p-5 hover:bg-white/[0.15] transition-all border border-white/[0.08] hover:border-white/20">
              <div className="text-[24px] mb-3">&#128269;</div>
              <div className="text-[15px] font-bold text-white">코치 섭외하기</div>
              <div className="text-[12px] text-white/40 mt-1.5 leading-relaxed">과정 등록 → 찜꽁<br />→ 확정 → 계약</div>
            </a>
            <a href="#manage" className="group relative overflow-hidden rounded-2xl bg-white/[0.08] backdrop-blur-xl p-5 hover:bg-white/[0.15] transition-all border border-white/[0.08] hover:border-white/20">
              <div className="text-[24px] mb-3">&#128203;</div>
              <div className="text-[15px] font-bold text-white">코치 정보 관리</div>
              <div className="text-[12px] text-white/40 mt-1.5 leading-relaxed">프로필 · 근무 이력<br />· 별점 · 메모</div>
            </a>
          </div>
        </div>
      </div>

      {/* Section: 코치 섭외하기 */}
      <div className="mx-auto max-w-4xl px-8">
        <div id="recruit" className="scroll-mt-8 pt-20 pb-6">
          <p className="text-[13px] font-bold text-[#1976D2] tracking-[0.15em] uppercase">코치 섭외하기</p>
          <h2 className="text-[28px] font-bold text-[#111] mt-2 tracking-tight">과정을 만들고,<br />코치님을 찾아보세요.</h2>
        </div>

        <div className="space-y-20 pb-20">
          {steps.slice(0, 8).map((step) => (
            <StepBlock key={step.number || step.title} step={step} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#E5E5EA]" />

      {/* Section: 코치 정보 관리 */}
      <div className="mx-auto max-w-4xl px-8">
        <div id="manage" className="scroll-mt-8 pt-20 pb-6">
          <p className="text-[13px] font-bold text-[#0F9D58] tracking-[0.15em] uppercase">코치 정보 관리</p>
          <h2 className="text-[28px] font-bold text-[#111] mt-2 tracking-tight">함께 일한 코치님의<br />기록을 남겨주세요.</h2>
        </div>

        <div className="space-y-20 pb-24">
          {steps.slice(8).map((step) => (
            <StepBlock key={step.title} step={step} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StepBlock({ step }: { step: typeof steps[number] }) {
  return (
    <div>
      {/* Text */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-4">
          {step.number && (
            <span className="text-[15px] font-black text-[#1976D2] tabular-nums">{step.number}</span>
          )}
          <h3 className="text-[22px] font-bold text-[#111] tracking-tight whitespace-pre-line leading-tight">{step.title}</h3>
        </div>
        <div className="text-[17px] text-[#555] leading-[1.8]">
          {step.content}
        </div>
      </div>

      {/* Image */}
      <div className="rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-black/[0.04]">
        <img
          src={step.image}
          alt={step.title}
          className="w-full h-auto"
        />
      </div>
    </div>
  )
}
