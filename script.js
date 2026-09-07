function updateTaskCount() {

    const tasks = document.querySelectorAll("#taskList li");

    document.getElementById("taskCount").textContent =
        "Total Tasks: " + tasks.length;
}


function addTask() {

    const input = document.getElementById("taskInput");
    const taskText = input.value.trim();

    if (taskText === "") {
        alert("Please enter a task.");
        return;
    }

    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = taskText;

    span.onclick = function() {
        span.classList.toggle("completed");
    };

    const deleteButton = document.createElement("button");

    deleteButton.textContent = "Delete";

    deleteButton.onclick = function() {
        li.remove();
        updateTaskCount();
    };

    li.appendChild(span);
    li.appendChild(deleteButton);

    document.getElementById("taskList").appendChild(li);

    input.value = "";

    updateTaskCount();
}
