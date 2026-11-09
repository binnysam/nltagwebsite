import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VideoEmbed } from "@/app/[locale]/_components/VideoEmbed.client";

describe("VideoEmbed (click-to-load YouTube)", () => {
  it("renders nothing that loads from YouTube or Google until Play is pressed", async () => {
    const { container } = render(<VideoEmbed id="dQw4w9WgXcQ" title="[Test] sermon" playLabel="Play video" notice="Nothing loads until you press play." />);
    expect(container.querySelector("iframe, img, script, link, video")).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtube|ytimg|google/i);
    await userEvent.click(screen.getByRole("button", { name: "Play video" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(frame.getAttribute("title")).toBe("[Test] sermon");
  });
});
