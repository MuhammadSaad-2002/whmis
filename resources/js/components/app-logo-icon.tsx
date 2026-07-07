import { SVGAttributes } from 'react';

// Filled warehouse mark — rendered with `fill-current` on the auth card and
// inside the sidebar brand box.
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 1.25 1.5 5.5V22a.75.75 0 0 0 .75.75h19.5A.75.75 0 0 0 22.5 22V5.5L12 1.25ZM7 12.5h10a1 1 0 0 1 1 1v7.75H6V13.5a1 1 0 0 1 1-1Zm1.5 2v1.75h7V14.5h-7Zm0 3.25V19.5h7v-1.75h-7Z"
            />
        </svg>
    );
}
