const serverURL = "http://localhost:3000"; // Replace with your actual server URL

const sendMessageToChatwork = async (account_id, messageBody) => {
    try {
        const response = await fetch(`${serverURL}/chatWorkSend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ account_id, messageBody }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log("Message sent successfully:", result);
        } else {
            console.error("Failed to send message:", response.status, await response.text());
        }
    } catch (error) {
        console.error("Error sending message to Chatwork:", error);
    }
};

sendMessageToChatwork(7427573, "hello world");