import svgPaths from "./svg-9b2lfwsny0";
import imgColorBends from "./194060f58cd738027524c8d246cb8a7bc2088d66.png";
import imgBrain3D from "./162f484e265b9f133d3cfbd0716795f3c1a36640.png";

function Seratone() {
  return (
    <div className="absolute h-[40.576px] left-[193px] top-[52px] w-[242.147px]" data-name="seratone">
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
    <div className="absolute contents left-[182px] top-[52px]" data-name="logo">
      <Seratone />
      <div className="absolute flex h-[24px] items-center justify-center left-[182px] top-[67.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#f4d35e] h-[3px] w-[24px]" data-name="Bar 3" />
        </div>
      </div>
      <div className="absolute flex h-[24px] items-center justify-center left-[185px] top-[67.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#ee964b] h-[3px] w-[24px]" data-name="Bar 2" />
        </div>
      </div>
      <div className="absolute flex h-[24px] items-center justify-center left-[188px] top-[67.94px] w-[3px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="-rotate-90 flex-none">
          <div className="bg-[#f95738] h-[3px] w-[24px]" data-name="Bar 1" />
        </div>
      </div>
    </div>
  );
}

function Svg() {
  return (
    <div className="absolute left-[996px] size-[24px] top-[89px]" data-name="svg">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="svg">
          <path d={svgPaths.p2695300} fill="var(--fill-0, #F95738)" id="Vector" />
          <path d={svgPaths.p2bc68480} fill="var(--fill-0, #F95738)" id="Vector_2" />
          <path d={svgPaths.pe345a00} fill="var(--fill-0, #F95738)" id="Vector_3" />
          <path d={svgPaths.p174e5480} fill="var(--fill-0, #F95738)" id="Vector_4" />
          <path d={svgPaths.p30afc200} fill="var(--fill-0, #F95738)" id="Vector_5" />
        </g>
      </svg>
    </div>
  );
}

function ImportButton() {
  return (
    <div className="absolute contents left-[901px] top-[75px]" data-name="import button">
      <div className="absolute bg-[rgba(249,87,56,0.2)] h-[50px] left-[901px] rounded-[100px] top-[75px] w-[140px]" data-name="pill" />
      <p className="absolute font-['Switzer_Variable:Medium',sans-serif] font-medium inset-[10.46%_23.67%_86.42%_71.95%] leading-[normal] text-[#f95738] text-[20px] tracking-[-0.8px] whitespace-nowrap">import</p>
      <Svg />
    </div>
  );
}

export default function IntroSection() {
  return (
    <div className="bg-white relative size-full" data-name="Intro Section">
      <div className="absolute bg-[#fffdf5] h-[832px] left-0 top-0 w-[1280px]" data-name="background" />
      <div className="absolute h-[1080px] left-[-617px] top-[-93px] w-[1920px]" data-name="color bends">
        <img alt="" className="absolute inset-0 max-w-none object-cover opacity-75 pointer-events-none size-full" src={imgColorBends} />
      </div>
      <div className="absolute bg-[#fffdf5] h-[93px] left-0 top-0 w-[1280px]" data-name="topbar" />
      <div className="absolute h-[738px] left-[309px] top-[103px] w-[662px]" data-name="brain 3d">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgBrain3D} />
      </div>
      <Logo />
      <ImportButton />
    </div>
  );
}