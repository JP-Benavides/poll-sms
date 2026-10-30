import type { UserInfo, ParsedPoll } from './types.ts'
 

export async function send_message(userConfig:UserInfo, poll:ParsedPoll){
    fetch(userConfig.discordURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(poll)
        }).then(res => {
        if (res.status === 204) console.log("Notification sent successfully!");
        })
        .catch(err => console.error("Error:", err));
    
}

