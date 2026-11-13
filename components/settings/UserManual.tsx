import type { ReactNode } from "react";

const card = "rounded-[22px] bg-white px-5 py-5";
const heading = "text-[17px] font-bold text-[#191f28]";
const body = "mt-2 text-[14px] leading-6 text-[#4e5968]";
const sub = "mt-4 text-[15px] font-bold text-[#191f28]";
const list = "mt-2 list-decimal space-y-1.5 pl-5 text-[14px] leading-6 text-[#4e5968]";
const box = "mt-3 rounded-2xl bg-[#f2f4f6] px-4 py-3 text-[13px] leading-5 text-[#4e5968]";
const note = "mt-3 rounded-2xl bg-[#e8f3ff] px-4 py-3 text-[13px] leading-5 text-[#1b4f9c]";
const warn = "mt-3 rounded-2xl bg-[#fff1f1] px-4 py-3 text-[13px] leading-5 text-[#b42318]";

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className={`flex items-center gap-2 ${heading}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[13px] font-bold text-[#3182f6]">
        {n}
      </span>
      {title}
    </h2>
  );
}

function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[13px]">
        <thead>
          <tr>
            {heads.map((head) => (
              <th key={head} className="border-b border-[#f2f4f6] py-2 pr-2 text-left font-semibold text-[#8b95a1]">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-[#f2f4f6] py-2 pr-2 align-top text-[#4e5968]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UserManual() {
  return (
    <div className="flex flex-col gap-3">
      <section className={card}>
        <p className="text-[13px] font-semibold text-[#3182f6]">EGG BALANCE · USER GUIDE</p>
        <h2 className="mt-1 text-[20px] font-bold tracking-tight text-[#191f28]">에그밸런스 사용 설명서</h2>
        <p className={body}>
          가지고 있는 자산을 넣으면, 이번 달 목표 비중과 어디가 많고 적은지를 보여 줍니다. 증권사로 주문을 보내지
          않습니다. 화면을 보고 직접 사고팔면 됩니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["2026년 11월 1일", "자산 입력부터 순서대로", "일반 사용자용"].map((item) => (
            <span key={item} className="rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[12px] font-semibold text-[#4e5968]">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className={card} id="before">
        <h2 className={heading}>시작하기 전에</h2>
        <p className={body}>에그밸런스는 이메일로 로그인하는 앱입니다. 보유 종목, 현금, 수익 기록은 로그인한 계정에만 저장됩니다.</p>
        <h3 className={sub}>가입</h3>
        <ol className={list}>
          <li>로그인 화면에서 <b>무료로 가입하기</b>를 누릅니다.</li>
          <li>이메일과 비밀번호(4자 이상)를 입력하고 <b>가입하고 시작</b>을 누릅니다.</li>
        </ol>
        <h3 className={sub}>로그인</h3>
        <ol className={list}>
          <li>이미 계정이 있으면 이메일과 비밀번호를 넣고 <b>로그인</b>을 누릅니다.</li>
          <li>관리자 계정은 이메일 칸에 관리자 ID를 넣어도 됩니다.</li>
        </ol>
        <div className={box}>
          <b>화면 이동.</b> 아래쪽 다섯 칸이 메뉴입니다. 홈 · 자산 · 수익 · 괴리 · 성과. 오른쪽 위 톱니바퀴는 설정입니다.
        </div>
      </section>

      <section className={card} id="asset">
        <Step n={1} title="자산을 입력합니다" />
        <p className={body}>
          모든 계산의 출발점은 자산 화면입니다. 처음 들어오면 홈에 <b>가지고 있는 자산을 등록해 주세요</b> 안내가 뜹니다.{" "}
          <b>자산 등록하기</b>를 누르거나, 아래 메뉴에서 <b>자산</b>을 누르면 됩니다.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-[12px] font-bold text-[#191f28]">
          {["1 자산 열기", "2 추가 누르기", "3 종목 또는 현금", "4 수량·금액 입력", "5 추가 저장"].map((item) => (
            <div key={item} className="rounded-xl bg-[#f2f4f6] px-2 py-2.5">
              {item}
            </div>
          ))}
        </div>
        <h3 className={sub}>종목을 넣을 때</h3>
        <p className={body}>주식, ETF, 채권, 금, 부동산 ETF는 이렇게 넣습니다. 비트코인은 목표 비중에 넣지 않습니다.</p>
        <ol className={list}>
          <li>보유 종목 오른쪽의 <b>추가</b>를 누릅니다.</li>
          <li>
            <b>티커(종목코드) 또는 종목명</b>을 입력합니다. 예: VOO, 005930, 삼성전자.
          </li>
          <li>자산군이 자동으로 잡히면 그대로 두고, 아니면 직접 고릅니다. 채권은 자산군에서 <b>채권</b>을 고르면 됩니다.</li>
          <li>
            <b>수량</b>을 입력합니다. 예: 10주.
          </li>
          <li>통화는 한국 종목은 KRW, 미국 종목은 USD가 보통 자동으로 맞춰집니다.</li>
          <li>
            <b>평균단가</b>를 입력합니다. 산 가격의 평균입니다. 나중에 수익률을 계산하는 기준이 됩니다.
          </li>
          <li>
            <b>추가</b>를 누르면 현재가를 찾아 총자산에 바로 더합니다.
          </li>
        </ol>
        <div className={box}>
          <b>예시.</b> 삼성전자 50주를 평균 70,000원에 가지고 있다면 티커 <b>005930</b> · 자산군 <b>한국주식</b> · 수량{" "}
          <b>50</b> · 통화 <b>KRW</b> · 평균단가 <b>70000</b>
        </div>
        <div className={box}>
          <b>예시.</b> 미국 ETF VOO를 12주, 평균 $480에 가지고 있다면 티커 <b>VOO</b> · 자산군 <b>미국주식</b> · 수량{" "}
          <b>12</b> · 통화 <b>USD</b> · 평균단가 <b>480</b>
        </div>
        <h3 className={sub}>현금을 넣을 때</h3>
        <p className={body}>
          원화와 달러는 티커 없이 금액만 넣습니다. 이미 고른 종목이 있으면 자산군을 원화나 달러로 바꿔도 그 종목은 유지되고,
          초단기 금리처럼 현금과 같은 ETF는 현금으로 셉니다.
        </p>
        <ol className={list}>
          <li>
            <b>추가</b>를 누른 뒤 자산군에서 <b>원화</b> 또는 <b>달러</b>를 고릅니다.
          </li>
          <li>원화는 원 단위 금액, 달러는 달러 금액을 입력합니다.</li>
          <li>
            <b>추가</b>를 누릅니다. 이미 현금이 있으면 그 금액에 더해집니다.
          </li>
        </ol>
        <div className={box}>
          <b>예시.</b> 증권 계좌에 300만 원이 있으면 자산군 <b>원화</b>, 금액 <b>3000000</b>. 달러 예금 $2,000이 있으면
          자산군 <b>달러</b>, 금액 <b>2000</b>
        </div>
        <div className={box}>
          <b>원화와 달러는 따로 둡니다.</b> 둘 다 다음 국면에서 살 때 쓰는 실탄으로 봅니다. 부동산은 실물 집이 아니라 상장된
          부동산 ETF만 넣습니다.
        </div>
        <h3 className={sub}>자산군</h3>
        <Table
          heads={["그룹", "자산군", "넣는 방법"]}
          rows={[
            ["주식", "미국주식, 한국주식", "티커 + 수량 + 평균단가"],
            ["채권", "채권 10년물, 채권 30년물", "티커 + 수량 + 평균단가. 자산군은 채권으로 고르면 됩니다."],
            ["자산", "금, 부동산 ETF", "ETF 티커 + 수량 + 평균단가"],
            ["펀드", "펀드", "펀드명 + 평가금액 + 손익. 수량과 평균단가는 받지 않습니다."],
            ["현금", "원화, 달러", "금액만. 이미 고른 초단기 ETF는 종목을 유지한 채 현금으로 셉니다."],
          ]}
        />
        <h3 className={sub}>고치거나 지울 때</h3>
        <ul className={`${list} list-disc`}>
          <li>종목 줄의 <b>수정</b>을 누르면 수량, 평균단가, 현재가를 바꿀 수 있습니다.</li>
          <li>미국주식은 수정 화면에서 <b>커버드콜</b> 표시를 켤 수 있습니다.</li>
          <li>
            <b>삭제</b>를 누르면 그 종목이 빠집니다. 삭제는 되돌릴 수 없습니다.
          </li>
          <li>
            같은 종목을 두 번 추가할 수는 없습니다. 이미 있으면 목록의 <b>수정</b>으로 수량을 바꿉니다.
          </li>
          <li>시계 아이콘을 누르면 그날그날 수량을 늘리거나 줄인 기록이 보입니다.</li>
        </ul>
        <h3 className={sub}>총자산과 환율</h3>
        <p className={body}>
          자산 화면 맨 위에 총자산이 나옵니다. 달러 자산은 원달러 환율로 원화로 바꿉니다. 환율은 기본적으로 오늘 시세가
          자동으로 들어갑니다. 숫자를 직접 고치면 그 값으로 고정되고, 그때 나타나는 <b>자동 환율</b>을 누르면 다시 자동으로
          돌아갑니다.
        </p>
        <div className={note}>
          <b>시세.</b> 종목을 추가하면 현재가를 자동으로 찾습니다. 없는 종목이거나 시세를 못 받으면 안내가 뜹니다. 티커를
          다시 확인한 뒤 넣어 주세요.
        </div>
      </section>

      <section className={card} id="home">
        <Step n={2} title="홈에서 총자산과 목표를 봅니다" />
        <p className={body}>자산을 넣었으면 아래 메뉴의 <b>홈</b>으로 돌아갑니다. 여기서는 계산 결과를 한눈에 봅니다.</p>
        <ol className={list}>
          <li>
            <b>내 자산</b>에서 지금 총자산을 확인합니다.
          </li>
          <li>그 아래 수익률은 성과 화면으로 이어집니다.</li>
          <li>
            <b>괴리율</b>에서 과다와 부족 개수를 봅니다. <b>자세히</b>를 누르면 괴리 화면으로 갑니다.
          </li>
          <li>
            달걀 그림에서 <b>지금 국면</b>을 봅니다. 국면은 관리자가 지정합니다. <b>왜 이 국면인가요</b>는 관리자가 적은
            설명이 펼쳐집니다. <b>그래서 비중은</b>과 성향별 설명도 같이 접혀 있습니다.
          </li>
          <li>달걀 아래 시장 칸에서 연준 기준금리와 원달러 환율을 확인합니다.</li>
          <li>
            <b>이번 달 목표 비중</b>을 눌러 주식·채권·자산·현금 그룹을 펼칩니다.
          </li>
          <li>더 아래로 내리면 추천 종목과 분석 리포트가 있습니다.</li>
        </ol>
        <div className={box}>
          <b>달걀의 여섯 칸.</b> 왼쪽 A1~A3은 올라가는 쪽, 오른쪽 B1~B3은 내려가는 쪽입니다. 이번 달 칸의 목표 비중이 모든
          계좌의 기준이 됩니다.
        </div>
        <Table
          heads={["국면", "이름", "한 줄 안내"]}
          rows={[
            ["A1", "조정", "주식매수, 부동산매도, 안전자산 매도"],
            ["A2", "동행", "주식보유"],
            ["A3", "과열", "주식매도, 예금입금"],
            ["B1", "조정", "예금출금, 채권매수"],
            ["B2", "동행", "장기채 최대, 주식은 비움"],
            ["B3", "과매도", "부동산 매수, 채권 매도"],
          ]}
        />
      </section>

      <section className={card} id="gap">
        <Step n={3} title="괴리에서 얼마나 맞출지 확인합니다" />
        <p className={body}>
          아래 메뉴의 <b>괴리</b>를 엽니다. 지금 비중이 이번 달 목표에서 얼마나 벗어났는지 자산군별로 보여 줍니다. 막대는
          현재 비중, 검은 눈금은 목표 비중입니다.
        </p>
        <Table
          heads={["표시", "의미", "어떻게 보면 되나요"]}
          rows={[
            [<span key="over" className="font-bold text-[#f04452]">과다</span>, "목표보다 2%p 넘게 많음", "증권사에서 조금 줄이는 것을 검토합니다."],
            [<span key="under" className="font-bold text-[#3182f6]">부족</span>, "목표보다 2%p 넘게 적음", "현금이나 다른 자산에서 채워 넣는 것을 검토합니다."],
            ["유지", "±2%p 안쪽", "일부러 맞추지 않고 그대로 둡니다."],
            ["일치", "목표와 같음", "손댈 필요가 없습니다."],
          ]}
        />
        <p className={body}>
          각 줄에는 “목표보다 ○○원 많아요 / 부족해요”처럼 금액도 나옵니다. 이 금액을 보고 증권사 앱에서 직접 사고팝니다.
        </p>
        <div className={warn}>
          <b>중요.</b> 에그밸런스는 주문을 보내지 않습니다. 화면은 안내일 뿐이고, 실제 매매는 본인이 확인한 뒤 증권사에서
          진행합니다.
        </div>
        <div className={note}>
          <b>작은 차이는 넘어갑니다.</b> 목표와 차이가 2%p보다 작으면 매매하지 말라고 표시합니다. 한 자산군이 60%를 넘지
          않도록 하는 안전장치도 있습니다.
        </div>
      </section>

      <section className={card} id="recommend">
        <Step n={4} title="추천 종목을 참고해 자산에 넣습니다" />
        <p className={body}>
          홈에서 <b>추천 종목</b>을 누르면 미국주식, 한국주식, 채권 ETF, 금 ETF, 부동산 ETF 목록이
          펼쳐집니다. 관리자가 올려 둔 참고 자료입니다. 수익을 보장하지 않습니다.
        </p>
        <ol className={list}>
          <li>보고 싶은 종목을 누릅니다.</li>
          <li>
            <b>자산에 추가할까요?</b>가 뜨면 내용을 확인하고 <b>확인</b>을 누릅니다.
          </li>
          <li>자산 화면의 추가 창에 티커와 자산군이 미리 채워집니다.</li>
          <li>
            실제로 산 수량과 평균단가를 넣은 뒤 <b>추가</b>를 누릅니다.
          </li>
        </ol>
        <p className={body}>
          홈 아래 <b>분석 리포트</b>는 날짜별 글을 펼쳐 읽는 보관함입니다. 제목을 누르면 본문이 열립니다.
        </p>
      </section>

      <section className={card} id="income">
        <Step n={5} title="배당·이자·판매 수익을 기록합니다" />
        <p className={body}>
          아래 메뉴의 <b>수익</b>을 엽니다. 여기서 넣은 금액은 총자산에 또 더하지 않습니다. 이미 자산에 들어온 돈 중에서{" "}
          <b>수익인 부분만</b> 적어, 성과 화면의 수익률에 반영합니다. 위쪽 <b>일별 / 월별 / 년도별</b>을 바꿔 배당·이자·판매
          수익 합을 토스처럼 기간별로 봅니다. 월·해를 누르면 그날·그달 내역으로 들어갑니다.
        </p>
        <ol className={list}>
          <li>
            오른쪽 <b>추가</b>를 누릅니다.
          </li>
          <li>
            종류를 고릅니다. <b>배당</b>, <b>이자</b>, <b>판매 수익</b> 중 하나입니다.
          </li>
          <li>
            통화를 <b>원</b> 또는 <b>달러</b>로 고르고 금액을 입력합니다. 달러는 지금 저장된 원달러 환율을 곱해
            원화로 바꿉니다. 배당과 이자는 0보다 큰 금액만 됩니다.
          </li>
          <li>
            판매 수익은 판 금액 전체가 아니라 <b>번 금액</b>입니다. 손실이면 −를 붙입니다.
          </li>
          <li>발생한 날짜를 고릅니다. 종목 이름은 선택입니다. 예: JEPI, 삼성전자.</li>
          <li>
            <b>추가</b>를 누릅니다. 잘못 넣었으면 줄의 <b>수정</b>으로 바꾸거나 <b>삭제</b>로 지웁니다.
          </li>
        </ol>
        <div className={box}>
          <b>예시.</b> JEPI에서 배당 45만 원이 들어왔다면 종류 <b>배당</b> · 통화 <b>원</b> · 금액 <b>450000</b> ·
          날짜는 입금일 · 종목 <b>JEPI</b>. 달러 배당 $120이면 통화 <b>달러</b> · 금액 <b>120</b>
        </div>
        <div className={box}>
          <b>왜 따로 적나요?</b> 자산 화면에 현금을 늘리면 그 돈은 “새로 넣은 돈”으로 보고 수익률에서 뺍니다. 그중
          배당·이자·매매 이익만 수익 화면에 적어야 수익률이 왜곡되지 않습니다.
        </div>
      </section>

      <section className={card} id="performance">
        <Step n={6} title="성과에서 수익률을 봅니다" />
        <p className={body}>아래 메뉴의 <b>성과</b>를 엽니다. 날짜가 쌓이면 그래프와 수익률이 채워집니다.</p>
        <ol className={list}>
          <li>맨 위 큰 숫자는 선택한 시점의 총자산입니다.</li>
          <li>그래프를 누르면 그 시점의 자산이 위에 표시됩니다.</li>
          <li>
            위쪽 <b>날짜별 / 월별 / 년도별</b>을 바꾸면 내 자산, 수익률, 기록이 같은 기간으로 맞춰집니다. 좌우 화살표로
            이전·다음 기간을 봅니다.
          </li>
          <li>그래프를 누르면 그 시점의 자산, 수익률, 기록이 함께 바뀝니다.</li>
          <li>날짜가 많아지면 수익률 그래프를 좌우로 밀어 이전 날짜를 봅니다. 최근 날짜가 오른쪽에 있습니다.</li>
          <li>
            <b>전 날(달·해)보다</b>는 바로 이전 기록과 비교한 구간 수익률입니다.
          </li>
          <li>
            <b>누적 수익률</b>은 주식 시세와 배당·이자·판매를 더한 손익을 그 시점의 자산으로 나눈 값입니다. 주식
            시세는 평균 매입가 대비 평가손익입니다. 날짜별 기록에 누적 손익과 함께 남고, 수익률 그래프가 이 누적을
            그립니다.
          </li>
          <li>기록의 날짜·달·해를 누르면 내 자산과 수익률이 그 시점으로 바뀝니다.</li>
          <li>시계 아이콘을 누르면 그날 종목·현금과 배당·이자 설명이 열립니다.</li>
        </ol>
        <div className={note}>
          <b>수익률에서 빼는 것과 더하는 것.</b> 새로 넣거나 뺀 종목·현금 금액은 수익률에서 제외합니다. 수익 화면에 적은
          배당·이자·판매 수익은 그 날짜의 수익률에 더합니다. 첫 평가일보다 전에 받은 금액은 첫 기록의 누적 수익률에 넣습니다.
        </div>
      </section>

      <section className={card} id="settings-guide">
        <Step n={7} title="설정에서 계정과 비밀번호를 관리합니다" />
        <p className={body}>오른쪽 위 톱니바퀴를 누르면 설정입니다.</p>
        <ul className={`${list} list-disc`}>
          <li>로그인한 이메일을 확인할 수 있습니다.</li>
          <li>
            <b>사용자 매뉴얼</b>에서 이 설명서를 다시 볼 수 있습니다.
          </li>
          <li>
            <b>비밀번호 변경</b>에서 지금 비밀번호와 새 비밀번호(4자 이상)를 넣습니다.
          </li>
          <li>
            <b>로그아웃</b>을 누르면 이 기기에서 나갑니다. 자산 데이터는 계정에 남아 있습니다.
          </li>
          <li>
            <b>회원 탈퇴</b>는 계정과 이 계정의 보유·기록을 지웁니다.
          </li>
        </ul>
      </section>

      <section className={card} id="tips">
        <h2 className={heading}>알아두면 좋은 점</h2>
        <h3 className={sub}>매달 이렇게 쓰면 됩니다</h3>
        <ol className={list}>
          <li>자산 화면에서 수량과 현금이 맞는지 확인합니다. 새로 샀거나 팔았으면 수정합니다.</li>
          <li>홈에서 이번 달 국면과 목표 비중을 봅니다.</li>
          <li>괴리에서 과다·부족만 골라 증권사에서 맞춥니다. ±2%p 안은 그대로 둡니다.</li>
          <li>배당이나 이자가 들어왔으면 수익 화면에 적습니다.</li>
          <li>성과에서 구간 수익률과 누적 수익률을 확인합니다.</li>
        </ol>
        <h3 className={sub}>국면별 목표 비중 (%)</h3>
        <p className={body}>
          관리자가 국면을 바꾸면 이 표가 자동으로 적용됩니다. 합은 각 국면마다 100%입니다. 비트코인은 변동성이 커서 목표
          비중에서 뺐습니다. 이미 가지고 있으면 자산에 적을 수 있고, 그때 괴리에서는 줄이는 쪽으로 나옵니다.
        </p>
        <Table
          heads={["자산군", "A1", "A2", "A3", "B1", "B2", "B3"]}
          rows={[
            ["미국주식", "25", "35", "20", "10", "5", "15"],
            ["한국주식", "10", "20", "10", "5", "0", "10"],
            ["채권 10년물", "15", "5", "5", "5", "5", "15"],
            ["채권 30년물", "5", "0", "5", "30", "35", "10"],
            ["금", "10", "10", "20", "15", "15", "10"],
            ["부동산 ETF", "10", "15", "5", "5", "5", "15"],
            ["원화", "15", "10", "15", "15", "15", "15"],
            ["달러", "10", "5", "20", "15", "20", "10"],
          ]}
        />
        <h3 className={sub}>자주 묻는 질문</h3>
        <p className={body}>
          <b>Q. 증권사와 연결되어 있나요?</b>
          <br />
          아니요. 숫자는 안내입니다. 실제 매매는 증권사 앱에서 직접 합니다.
        </p>
        <p className={body}>
          <b>Q. 국면은 제가 고르나요?</b>
          <br />
          일반 사용자는 고르지 않습니다. 관리자가 지정한 이번 달 국면이 모든 계좌의 기준입니다.
        </p>
        <p className={body}>
          <b>Q. 집을 넣어도 되나요?</b>
          <br />
          실물 부동산, 전세, 대출은 다루지 않습니다. 상장 부동산 ETF만 넣습니다.
        </p>
        <p className={body}>
          <b>Q. 시세가 안 뜨면요?</b>
          <br />
          티커나 종목명을 다시 확인하세요. 잠시 후 다시 추가해도 됩니다. 자산 화면 수정에서 현재가를 직접 넣을 수도 있습니다.
        </p>
        <p className={body}>
          <b>Q. 다른 사람 자산이 보이나요?</b>
          <br />
          보이지 않습니다. 로그인한 계정의 포트폴리오만 저장되고 보입니다.
        </p>
      </section>
    </div>
  );
}
