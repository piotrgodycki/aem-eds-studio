// A stand-in for `claude auth login`: prints the sign-in link, asks for the code, checks it.
import readline from "node:readline";

process.stdout.write("Opening browser to sign in…\n");
process.stdout.write(
	"If the browser didn't open, visit: https://claude.com/oauth/authorize?code=true&state=x\n",
);
process.stdout.write("Paste code here if prompted > ");
const rl = readline.createInterface({ input: process.stdin });
rl.once("line", (line) => {
	if (line.trim() === "good-code") {
		process.stdout.write("Login successful.\n");
		process.exit(0);
	}
	process.stderr.write("Invalid code.\n");
	process.exit(1);
});
