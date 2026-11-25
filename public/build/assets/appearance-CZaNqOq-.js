import{u as d,j as e,L as l}from"./app-D2HOYpvn.js";import{c as n}from"./utils-CiMRq3MP.js";import{c as a}from"./createLucideIcon-DqTvkNd7.js";import{S as h,H as x}from"./layout-DExStQT6.js";import{A as u}from"./app-layout-CFR7ThjH.js";/* empty css            */import"./clsx-B-dksMZM.js";import"./button-BtRkBOJV.js";import"./index-Dp3B9jqt.js";import"./index-D2lDtPOK.js";import"./triangle-alert-G-1Ys1lU.js";import"./use-permissions-DHEOOJe6.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],g=a("Monitor",y);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]],f=a("Moon",k);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],b=a("Sun",j);function v({className:s="",...o}){const{appearance:r,updateAppearance:c}=d(),i=[{value:"light",icon:b,label:"Light"},{value:"dark",icon:f,label:"Dark"},{value:"system",icon:g,label:"System"}];return e.jsx("div",{className:n("inline-flex gap-1 rounded-lg bg-muted p-1",s),...o,children:i.map(({value:t,icon:p,label:m})=>e.jsxs("button",{onClick:()=>c(t),className:n("flex items-center rounded-md px-3.5 py-1.5 transition-colors",r===t?"bg-card text-card-foreground shadow-xs":"text-muted-foreground hover:bg-accent hover:text-accent-foreground"),children:[e.jsx(p,{className:"-ml-1 h-4 w-4"}),e.jsx("span",{className:"ml-1.5 text-sm",children:m})]},t))})}const A=[{title:"Appearance settings",href:"/settings/appearance"}];function D(){return e.jsxs(u,{breadcrumbs:A,children:[e.jsx(l,{title:"Appearance settings"}),e.jsx(h,{children:e.jsxs("div",{className:"space-y-6",children:[e.jsx(x,{title:"Appearance settings",description:"Update your account's appearance settings"}),e.jsx(v,{})]})})]})}export{D as default};
