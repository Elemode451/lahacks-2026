import svgPaths from "./svg-syb5hmyv5i";
import imgColorBends from "./194060f58cd738027524c8d246cb8a7bc2088d66.png";
import imgBrain3D from "./162f484e265b9f133d3cfbd0716795f3c1a36640.png";

function Seratone() {
  return (
    <div className="absolute h-[40.576px] left-[204px] top-[53px] w-[242.147px]" data-name="seratone">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 242.147 40.576">
        <g id="seratone">
          <path d={svgPaths.p3d452600} fill="var(--fill-0, #0D3B66)" id="Vector" />
          <path d={svgPaths.p2afa2800} fill="var(--fill-0, #0D3B66)" id="Vector_2" />
          <path d={svgPaths.p35e7fdf0} fill="var(--fill-0, #0D3B66)" id="Vector_3" />
          <path d={svgPaths.pa3ccd00} fill="var(--fill-0, #0D3B66)" id="Vector_4" />
          <path d={svgPaths.p27c4ff00} fill="var(--fill-0, #0D3B66)" id="Vector_5" />
          <path d={svgPaths.p1b04ee00} fill="var(--fill-0, #0D3B66)" id="Vector_6" />
          <path d={svgPaths.p8179a80} fill="var(--fill-0, #0D3B66)" id="Vector_7" />
          <path d={svgPaths.p32890580} fill="var(--fill-0, #0D3B66)" id="Vector_8" />
          <path d="M0 15.936H3V30.436H0V15.936Z" fill="var(--fill-0, #0D3B66)" id="Rectangle 2" />
        </g>
      </svg>
    </div>
  );
}

function Logo() {
  return (
    <div className="absolute contents left-[193px] top-[53px]" data-name="logo">
      <Seratone />
      <div className="absolute flex h-[24px] items-center justify-center left-[193px] top-[68.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#f4d35e] h-[3px] w-[24px]" data-name="Bar 3" />
        </div>
      </div>
      <div className="absolute flex h-[24px] items-center justify-center left-[196px] top-[68.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#ee964b] h-[3px] w-[24px]" data-name="Bar 2" />
        </div>
      </div>
      <div className="absolute flex h-[24px] items-center justify-center left-[199px] top-[68.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#f95738] h-[3px] w-[24px]" data-name="Bar 1" />
        </div>
      </div>
    </div>
  );
}

function SpiderChart() {
  return (
    <div className="absolute left-[772px] size-[408px] top-[53px]" data-name="spider chart">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 408 408">
        <g id="spider chart">
          <path d={svgPaths.p727db00} fill="var(--fill-0, #0D3B66)" id="background" />
          <path d={svgPaths.pf291900} id="values" stroke="var(--stroke-0, #F95738)" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );
}

function Metrics() {
  return (
    <div className="absolute contents font-['Switzer_Variable:Regular',sans-serif] font-normal inset-[42.19%_9.92%_44.59%_57.5%] leading-[normal] text-[#0d3b66] text-[14px] tracking-[-0.56px] whitespace-nowrap" data-name="metrics">
      <p className="absolute inset-[43.27%_36.95%_54.57%_57.5%]">danceability</p>
      <p className="absolute inset-[53.25%_27.97%_44.59%_68.75%]">energy</p>
      <p className="absolute inset-[53.25%_18.52%_44.59%_80.86%]">x</p>
      <p className="absolute inset-[42.19%_9.92%_55.65%_89.45%]">y</p>
    </div>
  );
}

export default function TypicalInterface() {
  return (
    <div className="bg-white relative size-full" data-name="Typical Interface">
      <div className="absolute bg-[#fffdf5] h-[832px] left-0 top-0 w-[1280px]" data-name="background" />
      <div className="absolute h-[1080px] left-[-617px] top-[-93px] w-[1920px]" data-name="color bends">
        <img alt="" className="absolute inset-0 max-w-none object-cover opacity-75 pointer-events-none size-full" src={imgColorBends} />
      </div>
      <div className="absolute bg-[#fffdf5] h-[832px] left-[640px] top-0 w-[640px]" data-name="right section" />
      <div className="absolute bg-[#fffdf5] h-[832px] left-0 opacity-0 top-0 w-[640px]" data-name="left section" />
      <div className="absolute h-[738px] left-[-11px] top-[103px] w-[662px]" data-name="brain 3d">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgBrain3D} />
      </div>
      <Logo />
      <SpiderChart />
      <Metrics />
      <p className="absolute font-['Switzer_Variable:Regular',sans-serif] font-normal h-[252px] leading-[normal] left-[699px] text-[#0d3b66] text-[14px] top-[540px] tracking-[-0.56px] w-[336px] whitespace-pre-wrap">
        overview:
        <br aria-hidden="true" />
        <br aria-hidden="true" />
        this music fits x profile and y listening...
      </p>
    </div>
  );
}